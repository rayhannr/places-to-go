import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { Tool } from 'ai'

// Tools that trigger Google Maps API calls and their daily limits.
// Limits are intentionally generous for personal use — the goal is to catch
// runaway bugs or abuse, not to restrict normal usage.
const TOOL_LIMITS: Record<string, { requests: number; window: `${number} ${'s' | 'm' | 'h' | 'd'}` }> = {
  // Routes API + Geocoding + Places API per call
  add_place: { requests: 50, window: '1 d' },
  // Routes API for every place in the list — most expensive tool
  sync_all_distances: { requests: 10, window: '1 d' },
  // Places API Text Search
  search_google_maps: { requests: 100, window: '1 d' },
  // Geocoding API (reverse geocode)
  get_current_location: { requests: 100, window: '1 d' },
  // Geocoding / Places API
  parse_place_link: { requests: 50, window: '1 d' }
}

// Sheets-only tools get a looser cap — no Maps API cost
const DEFAULT_LIMIT = { requests: 500, window: '1 d' } as const

let redis: Redis | null = null
const limiters = new Map<string, Ratelimit>()

function getRedis(): Redis | null {
  if (redis) return redis
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  redis = Redis.fromEnv()
  return redis
}

function getLimiter(toolName: string): Ratelimit | null {
  const r = getRedis()
  if (!r) return null

  const mode = process.env.DEMO_MODE === 'true' ? 'demo' : 'prod'
  const key = `${mode}:${toolName}`
  if (limiters.has(key)) return limiters.get(key)!

  const cfg = TOOL_LIMITS[toolName] ?? DEFAULT_LIMIT
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(cfg.requests, cfg.window),
    prefix: `ptg:${mode}:rl:${toolName}`
  })
  limiters.set(key, limiter)
  return limiter
}

/**
 * Wraps tools with per-tool Upstash rate limiting, keyed by the caller's IP.
 * If Upstash env vars are absent, the wrapper is a no-op so the app still works
 * without a Redis instance (e.g. local dev).
 */
export function wrapToolsWithRateLimit(tools: Record<string, Tool<any, any>>, identifier: string) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        ...tool,
        execute: tool.execute
          ? async (args: any, options: any) => {
              const limiter = getLimiter(name)
              if (limiter) {
                const { success, limit, remaining, reset } = await limiter.limit(identifier)
                if (!success) {
                  const resetsAt = new Date(reset).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                  })
                  console.warn(`[Rate Limit] ${name} blocked for ${identifier}. Limit: ${limit}/day, resets at ${resetsAt}`)
                  return {
                    error: 'RATE_LIMIT_EXCEEDED',
                    message: `Daily call limit reached for ${name} (${limit}/day). Resets at ${resetsAt}.`
                  }
                }
                console.log(`[Rate Limit] ${name} — ${remaining}/${limit} remaining today`)
              }
              return tool.execute!(args, options)
            }
          : undefined
      }
    ])
  )
}
