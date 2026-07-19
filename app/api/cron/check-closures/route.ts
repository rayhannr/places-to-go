import { NextResponse } from 'next/server'
import { getRows, deleteRow, updatePriorities } from '@/lib/googleSheets'
import { SPREADSHEET_ID, TAB_NAME, getPrioritizedEntries, buildPriorityUpdates } from '@/lib/ai/tools/logic'
import { extractPlaceId, getPlaceBusinessStatus } from '@/lib/ai/tools/utils'
import { bot } from '@/lib/bot'
import { getRedis } from '@/lib/redis'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CONCURRENCY = 8

// Skip re-checking a place if it was already checked within this window — guards against
// burning calls on a place that was just checked by an earlier run this same cycle (e.g. a
// manual trigger shortly before/after the scheduled monthly cron).
const RECHECK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const LAST_CHECKED_TTL_SECS = 60 * 24 * 60 * 60 // auto-cleanup bookkeeping well after the cooldown is stale
const LAST_CHECKED_PREFIX = 'ptg:closure-check:last-checked:'

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * Monthly (or manually triggered) sweep: finds unvisited places whose Google Maps
 * business status has flipped to permanently closed, removes them from the tracker,
 * and pushes a Telegram notification listing what got cleaned up.
 */
export async function GET(req: Request) {
  if (process.env.DEMO_MODE === 'true') {
    return NextResponse.json({ error: 'Not available in demo mode' }, { status: 403 })
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allowedUserIds =
      process.env.TELEGRAM_ALLOWED_USER_ID?.split(',')
        .map(id => id.trim())
        .filter(Boolean) || []

    const rows = await getRows(SPREADSHEET_ID, TAB_NAME)
    const unvisited = rows.map((row, i) => ({ row, index: i + 2 })).filter(({ row }) => !row['Date Visited'])

    const withPlaceId = unvisited
      .map(p => ({ ...p, placeId: extractPlaceId(p.row.Link || '') }))
      .filter((p): p is typeof p & { placeId: string } => !!p.placeId)

    // Filter out places checked too recently. Falls back to checking everyone if Redis isn't configured.
    const redis = getRedis()
    let checkable = withPlaceId
    let skippedRecentlyChecked = 0

    if (redis && withPlaceId.length > 0) {
      const lastCheckedKeys = withPlaceId.map(p => `${LAST_CHECKED_PREFIX}${p.placeId}`)
      const lastChecked = await redis.mget<(number | null)[]>(...lastCheckedKeys)
      const now = Date.now()

      checkable = withPlaceId.filter((p, i) => {
        const checkedAt = lastChecked[i]
        const isRecentlyChecked = typeof checkedAt === 'number' && now - checkedAt < RECHECK_COOLDOWN_MS
        if (isRecentlyChecked) skippedRecentlyChecked++
        return !isRecentlyChecked
      })
    }

    const statuses = await mapWithConcurrency(checkable, CONCURRENCY, async p => ({
      ...p,
      status: await getPlaceBusinessStatus(p.placeId)
    }))

    // Record that these places were just checked (regardless of outcome) so the cooldown applies next run.
    if (redis && statuses.length > 0) {
      await Promise.all(
        statuses.map(p => redis!.set(`${LAST_CHECKED_PREFIX}${p.placeId}`, Date.now(), { ex: LAST_CHECKED_TTL_SECS }))
      )
    }

    const closed = statuses.filter(p => p.status === 'CLOSED_PERMANENTLY')

    // Delete highest row index first so lower indices stay valid for the rest of the batch.
    const toDelete = [...closed].sort((a, b) => b.index - a.index)
    for (const p of toDelete) {
      await deleteRow(SPREADSHEET_ID, TAB_NAME, p.index)
      if (redis) await redis.del(`${LAST_CHECKED_PREFIX}${p.placeId}`)
    }

    if (closed.length > 0) {
      const freshRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      const priorityUpdates = buildPriorityUpdates(getPrioritizedEntries(freshRows))
      if (priorityUpdates.length > 0) {
        await updatePriorities(SPREADSHEET_ID, TAB_NAME, priorityUpdates)
      }
    }

    let notified = false
    if (closed.length > 0 && allowedUserIds.length > 0) {
      const list = closed.map(p => `- ${p.row.Name} (${p.row.City})`).join('\n')
      const message = `Closure check ran, bro. ${closed.length} spot${closed.length !== 1 ? 's' : ''} permanently closed, deleted from the list:\n\n${list}`
      await Promise.all(
        allowedUserIds.map(id => bot.api.sendMessage(id, message).catch(err => console.error(`[Closure Check] Failed to notify ${id}:`, err)))
      )
      notified = true
    }

    return NextResponse.json({
      unvisitedChecked: checkable.length,
      skippedNoPlaceId: unvisited.length - withPlaceId.length,
      skippedRecentlyChecked,
      closed: closed.map(p => ({ name: p.row.Name, city: p.row.City })),
      notified
    })
  } catch (error: any) {
    console.error('Closure check error:', error)
    return NextResponse.json({ error: error.message || 'Closure check failed' }, { status: 500 })
  }
}
