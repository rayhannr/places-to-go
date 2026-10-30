import levenshtein from 'fast-levenshtein'
import { PlaceRow, updateLiveDistances, updateSheetLinks } from '../../googleSheets'
import {
  Coords,
  extractCoords,
  getDistancesBatch,
  haversineDistance,
  parseDurationSecs,
  resolveShortLink,
  coordsFromPlaceName
} from './utils'

export const SPREADSHEET_ID = process.env.SPREADSHEET_ID!
export const TAB_NAME = 'Food'

function orNull(v: string | number | null | undefined): string | number | null {
  return v === null || v === undefined || v === '' ? null : v
}

export function compactPlace(r: PlaceRow, useLive = false) {
  // Don't fall back to the home-base columns when live is requested but blank (e.g. a place
  // outside the synced topN) — that would silently mislabel the home-base distance as live.
  const dist = useLive ? orNull(r['Distance (from current location)']) : r['Distance (km)']
  const time = useLive ? orNull(r['Travel Time (from current location)']) : r['Travel Time (min)']

  return {
    name: r.Name,
    city: r.City,
    link: r.Link,
    dist,
    time,
    visited: r['Date Visited'] || null,
    category: r.Category || null
  }
}

interface RouteCandidate {
  coords: Coords
  hav: number
}

interface RoutedLeg {
  distKm: number | null
  travelMin: number | null
}

/**
 * Max places we ask Google about when topN is set, i.e. when we only want the nearest few.
 *
 * Why cap at all: the stop rule below weighs one place's road distance against the next place's
 * straight-line distance, and roads always run longer than straight lines. Say the list holds 200
 * places around town X and you open the app from town Y, 100km away. Every place is then ~100km in
 * a straight line but ~130km by road, so the rule keeps asking "is 130km under 100km?" — never
 * true, and we'd ask about all 200.
 *
 * Why 40: topN can't exceed 10, so this is 4x the most we ever need to rank. In practice the true
 * nearest 10 sit well inside the nearest 40 by straight line, so this leaves a wide margin.
 */
const MAX_ROUTED = 40

/**
 * Ask Google for road distances, nearest places first, and stop once the top N is settled.
 *
 * A road is never shorter than a straight line. So if the Nth closest we've found is 3.1km by road,
 * a place that's 3.2km away in a straight line can't beat it — and neither can anything behind it,
 * since they're farther still. That's when we stop and skip the rest.
 *
 * Returns candidate index -> distance/time, only for the ones we actually asked about.
 */
async function routeUntilTopNProven(
  origin: Coords,
  candidates: RouteCandidate[],
  topN: number,
  maxRouted = MAX_ROUTED
): Promise<Map<number, RoutedLeg>> {
  const routed = new Map<number, RoutedLeg>()
  let done = 0
  // Ask for more than topN in the first batch. Roads run ~1.4x longer than straight lines, so the
  // Nth closest in a straight line is usually not the Nth closest by road.
  // The +5 covers small topN (topN of 1 would otherwise ask for 2), the *2 covers large topN.
  const firstBatch = Math.max(topN * 2, topN + 5)
  let target = Math.min(candidates.length, firstBatch)

  while (done < target) {
    const batch = candidates.slice(done, target)
    const results = await getDistancesBatch(
      origin,
      batch.map(c => c.coords)
    )

    results.forEach(res => {
      const isSuccess = !res.status || res.status.code === 0 || Object.keys(res.status).length === 0
      if (res.destinationIndex === undefined || !isSuccess) return
      const secs = parseDurationSecs(res.duration)
      routed.set(done + res.destinationIndex, {
        distKm: res.distanceMeters ? +(res.distanceMeters / 1000).toFixed(2) : null,
        travelMin: secs ? +(secs / 60).toFixed(1) : null
      })
    })

    done = target
    if (done >= candidates.length) break

    const nthBest = [...routed.values()]
      .map(l => l.distKm)
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b)[topN - 1]

    if (nthBest !== undefined && nthBest <= candidates[done].hav) {
      console.log(
        `[Sync] Top ${topN} proven after ${done} of ${candidates.length} routed (next is >= ${candidates[done].hav.toFixed(2)}km straight-line)`
      )
      break
    }

    if (done >= maxRouted) {
      console.log(`[Sync] Hit the ${maxRouted} cap before proving top ${topN} — everything is roughly equidistant from here.`)
      break
    }

    target = Math.min(candidates.length, maxRouted, done + Math.max(10, topN))
  }

  return routed
}

export async function syncLiveDistancesIfNeeded(
  rows: PlaceRow[],
  userLocation: Coords | undefined,
  topN?: number
): Promise<PlaceRow[]> {
  if (!userLocation) return rows
  if (rows.length === 0) return rows

  // Only sync unvisited places — visited ones are unlikely to be revisited and
  // keeping them out cuts Routes API elements proportionally to visits accumulated.
  const unvisited = rows.map((r, i) => ({ row: r, originalIndex: i })).filter(({ row }) => !row['Date Visited'])

  if (unvisited.length === 0) return rows

  console.log(
    `[Sync] Recalculating distances for ${unvisited.length} unvisited rows (${rows.length - unvisited.length} visited skipped)...`
  )

  // Resolve short links and find coordinates (with geocode fallback)
  const resolvedRows = await Promise.all(
    unvisited.map(async ({ row: r, originalIndex }) => {
      const link = r.Link || ''
      const name = r.Name || ''
      const city = r.City || ''

      const needsResolve = link.includes('maps.app.goo.gl') || link.includes('goo.gl/maps')
      const fullUrl = needsResolve ? await resolveShortLink(link) : link

      let coords = extractCoords(fullUrl)

      // Last Resort: Geocode by Name + City if link is still coord-less
      if (!coords && name) {
        console.log(`[Sync] Last resort: Geocoding "${name}, ${city}"`)
        coords = await coordsFromPlaceName(`${name}, ${city}`)
      }

      return { ...r, resolvedLink: fullUrl, coords, originalIndex }
    })
  )

  // Sort nearest first by straight line, so we can stop early once the top N is settled.
  const rowsWithCoords = resolvedRows
    .filter((r): r is typeof r & { coords: Coords } => !!r.coords)
    .map(r => ({ ...r, hav: haversineDistance(userLocation.lat, userLocation.lng, r.coords.lat, r.coords.lng) }))
    .sort((a, b) => a.hav - b.hav)

  if (rowsWithCoords.length === 0) {
    console.warn('[Sync] No destinations with valid coordinates found.')
    return rows
  }

  // No topN means calculate everything — that's what the lens tools still do.
  const routed = topN
    ? await routeUntilTopNProven(userLocation, rowsWithCoords, topN)
    : await routeUntilTopNProven(userLocation, rowsWithCoords, rowsWithCoords.length, rowsWithCoords.length)
  console.log(`[Sync] Routed ${routed.size} of ${rowsWithCoords.length} candidates.`)

  // Write '' and not null. Sheets reads null as "don't touch this cell", so every row we skip
  // would keep its old distance from wherever we synced last time.
  const updateValues: (string | number | null)[][] = rows.map(() => ['', ''])
  const linkUpdateValues: (string | null)[][] = rows.map(r => [r.Link || null])
  let linksChanged = false

  // We just blanked these cells in the sheet, so blank our in-memory copies too.
  // Otherwise whoever called us sorts on numbers the sheet no longer has.
  rows.forEach(r => {
    r['Distance (from current location)'] = null
    r['Travel Time (from current location)'] = null
  })

  routed.forEach((leg, candidateIndex) => {
    const matchedRow = rowsWithCoords[candidateIndex]
    const rowIndex = matchedRow.originalIndex

    if (rowIndex !== undefined && rowIndex !== -1) {
      updateValues[rowIndex] = [leg.distKm, leg.travelMin]
      rows[rowIndex]['Distance (from current location)'] = leg.distKm
      rows[rowIndex]['Travel Time (from current location)'] = leg.travelMin

      // Check if link was repaired (resolved or tagged)
      const originalLink = rows[rowIndex].Link
      const repairedLink = matchedRow.resolvedLink

      // Inject tag if we geocoded but URL is still coord-less
      let finalLink = repairedLink
      if (matchedRow.coords && !extractCoords(repairedLink)) {
        const separator = repairedLink.includes('?') ? '&' : '?'
        finalLink = `${repairedLink}${separator}ll=${matchedRow.coords.lat},${matchedRow.coords.lng}`
      }

      if (finalLink !== originalLink) {
        linkUpdateValues[rowIndex] = [finalLink]
        rows[rowIndex].Link = finalLink // Update local object
        linksChanged = true
      }
    }
  })

  if (linksChanged) {
    console.log('[Sync] Repairing links in Google Sheets...')
    await updateSheetLinks(SPREADSHEET_ID, TAB_NAME, linkUpdateValues)
  }

  console.log('[Sync] Sending distance updates to Google Sheets...')
  await updateLiveDistances(SPREADSHEET_ID, TAB_NAME, updateValues)
  console.log('[Sync] Sheet update completed.')

  return rows
}

export function filterByStatus(rows: PlaceRow[], status: 'visited' | 'unvisited') {
  return rows.filter(r => (status === 'visited' ? !!r['Date Visited'] : !r['Date Visited']))
}

interface PaginatedResult<T> {
  items: T[]
  page: number
  pageSize: number
  totalPages: number
  totalCount: number
}

/**
 * Slice an already-ordered list into a page, clamping page/pageSize to valid ranges.
 * Shared by list tools so the AI can page through results beyond the per-call cap instead of only ever seeing the first N.
 */
export function paginate<T>(items: T[], page = 1, pageSize = 10, maxPageSize = 10): PaginatedResult<T> {
  const safePageSize = Math.min(Math.max(1, pageSize), maxPageSize)
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * safePageSize

  return {
    items: items.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    totalPages,
    totalCount: items.length
  }
}

interface PriorityEntry {
  index: number // 1-based sheet row
  name: string
  priority: number
}

/**
 * Rows carrying a valid Priority value, sorted ascending (1 = highest priority).
 * Pass excludeIndex to leave a specific row (e.g. the one being re-prioritized) out of the ordering.
 */
export function getPrioritizedEntries(rows: PlaceRow[], excludeIndex?: number): PriorityEntry[] {
  return rows
    .map((r, i) => ({ index: i + 2, name: r.Name, priority: parseInt(String(r.Priority ?? ''), 10) }))
    .filter(p => p.index !== excludeIndex && !isNaN(p.priority) && p.priority > 0)
    .sort((a, b) => a.priority - b.priority)
}

/**
 * Diff an ordered list of priority entries against sequential ranks (1..N),
 * returning only the sheet writes actually needed to close gaps / apply the new order.
 */
export function buildPriorityUpdates(entries: PriorityEntry[]): { rowIndex: number; priority: number }[] {
  const updates: { rowIndex: number; priority: number }[] = []
  entries.forEach((p, i) => {
    const newPriority = i + 1
    if (p.priority !== newPriority) updates.push({ rowIndex: p.index, priority: newPriority })
  })
  return updates
}

/**
 * Find the best fuzzy-matched place by name, or null if nothing matches closely enough.
 * Shared by tools that look up a single place by name (visit/delete/prioritize/categorize).
 */
export function findPlaceByName(rows: PlaceRow[], name: string) {
  const bestMatch = fuzzySearchPlaces(rows, name)[0]
  // Threshold for matching: if the score is too high, it's likely not a match
  return !bestMatch || bestMatch.score > 5 ? null : bestMatch
}

export function placeNotFoundMessage(name: string): string {
  return `Bro "${name}" doesn't even exist in your list. You out here hallucinating places or what?`
}

/**
 * Perform fuzzy search on rows by place name.
 */
export function fuzzySearchPlaces(rows: PlaceRow[], query: string) {
  const queryLower = query.toLowerCase()

  return rows
    .map((r, index) => {
      const name = (r.Name || '').toLowerCase()
      let score = levenshtein.get(name, queryLower)

      if (name === queryLower) {
        score = 0
      } else if (name.includes(queryLower) || queryLower.includes(name)) {
        score = 1
      } else {
        score = score + 2
      }

      return { row: r, index: index + 2, score }
    })
    .sort((a, b) => a.score - b.score)
}
