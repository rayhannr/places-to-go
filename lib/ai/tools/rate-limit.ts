import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { Tool } from 'ai'

type LimitConfig = { requests: number; window: `${number} ${'s' | 'm' | 'h' | 'd'}` }

// Global limits for the personal (prod) instance — one shared bucket across ALL IPs.
// Worst-case: search $51 + add $48 + parse $7.50 + location $1.50 + sync $46 = ~$154/month.
// Prod and demo share the same GCP account. Combined worst-case: ~$188/month → $12 buffer → $0 charged.
const PROD_TOOL_LIMITS: Record<string, LimitConfig> = {
  add_place: { requests: 50, window: '1 d' },
  sync_all_distances: { requests: 20, window: '30 d' },
  search_google_maps: { requests: 100, window: '1 d' },
  get_current_location: { requests: 10, window: '1 d' },
  parse_place_link: { requests: 50, window: '1 d' }
}

// Global limits for demo mode — one shared bucket across ALL users.
// Demo worst-case: search $10.20 + add $9.60 + parse $1.50 + location $1.50 + sync $11.25 = ~$34/month
// Combined prod + demo worst-case: ~$188/month → $12 buffer → $0 charged.
const DEMO_TOOL_LIMITS: Record<string, LimitConfig> = {
  add_place: { requests: 10, window: '1 d' },
  sync_all_distances: { requests: 15, window: '30 d' },
  search_google_maps: { requests: 20, window: '1 d' },
  get_current_location: { requests: 10, window: '1 d' },
  parse_place_link: { requests: 10, window: '1 d' }
}

// Sheets-only tools get a looser cap — no Maps API cost
const DEFAULT_LIMIT: LimitConfig = { requests: 500, window: '1 d' }

const IS_DEMO = process.env.DEMO_MODE === 'true'

let redis: Redis | null = null
const limiters = new Map<string, Ratelimit>()

function getRedis(): Redis | null {
  if (redis) return redis
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  redis = Redis.fromEnv()
  return redis
}

const TOOL_LIMITS = IS_DEMO ? DEMO_TOOL_LIMITS : PROD_TOOL_LIMITS

function getLimiter(toolName: string): Ratelimit | null {
  const r = getRedis()
  if (!r) return null

  const mode = IS_DEMO ? 'demo' : 'prod'
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
              const limiter = getLimiter(name)
              if (limiter) {
                const effectiveIdentifier = name in TOOL_LIMITS ? 'global' : identifier
                const { success, limit, remaining, reset } = await limiter.limit(effectiveIdentifier)
                if (!success) {
                  const resetsAt = new Date(reset).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                  })
                  console.warn(`[Rate Limit] ${name} blocked for ${effectiveIdentifier}. Limit: ${limit}/day, resets at ${resetsAt}`)
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
