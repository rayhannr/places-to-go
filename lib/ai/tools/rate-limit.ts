import { Ratelimit } from '@upstash/ratelimit'
import type { Tool } from 'ai'
import { getRedis } from '../../redis'

type LimitConfig = { requests: number; window: `${number} ${'s' | 'm' | 'h' | 'd'}` }

// These 6 "lens" tools all route through syncLiveDistancesIfNeeded when given a userLocation,
// each costing up to ~40 Routes elements (the MAX_ROUTED cap). They share one bucket — keyed by
// total Routes elements burned, not by which specific tool triggered them — same as sync_all_distances.
const LENS_TOOLS = [
  'get_random_places',
  'get_nearby_places',
  'get_quickest_places',
  'get_places_by_city',
  'get_places_by_category',
  'search_places_by_name'
]

// Global limits for the personal (prod) instance — one shared bucket across ALL IPs.
// Worst-case: search $51 + add $48 + parse $7.50 + location $1.50 + sync $46 + lens_routes $48 = ~$202/month.
// Prod and demo share the same GCP account. Combined with demo's worst-case, this stays a rounding error
// above Google's old $200 pooled credit — which no longer exists (per-SKU free tiers replaced it in 2025) —
// so treat these caps as the only thing standing between normal use and a real bill, not a credit-sized buffer.
const PROD_TOOL_LIMITS: Record<string, LimitConfig> = {
  add_place: { requests: 50, window: '1 d' },
  sync_all_distances: { requests: 20, window: '30 d' },
  lens_routes: { requests: 60, window: '30 d' },
  search_google_maps: { requests: 100, window: '1 d' },
  get_current_location: { requests: 10, window: '1 d' },
  parse_place_link: { requests: 50, window: '1 d' }
}

// Global limits for demo mode — one shared bucket across ALL users.
// Demo worst-case: search $10.20 + add $9.60 + parse $1.50 + location $1.50 + sync $11.25 + lens_routes $8 = ~$42/month
const DEMO_TOOL_LIMITS: Record<string, LimitConfig> = {
  add_place: { requests: 10, window: '1 d' },
  sync_all_distances: { requests: 15, window: '30 d' },
  lens_routes: { requests: 40, window: '30 d' },
  search_google_maps: { requests: 20, window: '1 d' },
  get_current_location: { requests: 10, window: '1 d' },
  parse_place_link: { requests: 10, window: '1 d' }
}

// Sheets-only tools get a looser cap — no Maps API cost
const DEFAULT_LIMIT: LimitConfig = { requests: 500, window: '1 d' }

const IS_DEMO = process.env.DEMO_MODE === 'true'

const limiters = new Map<string, Ratelimit>()

const TOOL_LIMITS = IS_DEMO ? DEMO_TOOL_LIMITS : PROD_TOOL_LIMITS

// Tools in LENS_TOOLS share the "lens_routes" bucket instead of getting their own.
function bucketFor(toolName: string): string {
  return LENS_TOOLS.includes(toolName) ? 'lens_routes' : toolName
}

function getLimiter(bucketName: string): Ratelimit | null {
  const r = getRedis()
  if (!r) return null

  const mode = IS_DEMO ? 'demo' : 'prod'
  const key = `${mode}:${bucketName}`
  if (limiters.has(key)) return limiters.get(key)!

  const cfg = TOOL_LIMITS[bucketName] ?? DEFAULT_LIMIT
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(cfg.requests, cfg.window),
    prefix: `ptg:${mode}:rl:${bucketName}`
  })
  limiters.set(key, limiter)
  return limiter
}

/**
 * Wraps tools with per-tool Upstash rate limiting.
 * Maps API tools use a single global bucket shared across ALL IPs in both prod and demo,
 * capping total monthly spend under Google's $200 free credit → $0 charged.
 * Non-Maps tools (Sheets-only) remain per-IP with a generous default cap.
 */
export function wrapToolsWithRateLimit(tools: Record<string, Tool<any, any>>, identifier: string) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        ...tool,
        execute: tool.execute
          ? async (args: any, options: any) => {
              const bucket = bucketFor(name)
              const limiter = getLimiter(bucket)
              if (limiter) {
                const effectiveIdentifier = bucket in TOOL_LIMITS ? 'global' : identifier
                const { success, limit, remaining, reset } = await limiter.limit(effectiveIdentifier)
                if (!success) {
                  const resetsAt = new Date(reset).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                  })
                  console.warn(`[Rate Limit] ${name} (bucket: ${bucket}) blocked for ${effectiveIdentifier}. Limit: ${limit}, resets at ${resetsAt}`)
                  return {
                    error: 'RATE_LIMIT_EXCEEDED',
                    message: `Call limit reached for ${name} (${limit} per window). Resets at ${resetsAt}.`
                  }
                }
                console.log(`[Rate Limit] ${name} (bucket: ${bucket}) — ${remaining}/${limit} remaining`)
              }
              return tool.execute!(args, options)
            }
          : undefined
      }
    ])
  )
}
