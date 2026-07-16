import { Redis } from '@upstash/redis'

let redis: Redis | null = null
let checked = false

/**
 * Shared Upstash Redis client, reused by rate limiting and the Sheets row cache.
 * Returns null if UPSTASH_* env vars are absent (e.g. local dev) so callers can gracefully no-op.
 */
export function getRedis(): Redis | null {
  if (checked) return redis
  checked = true
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  redis = Redis.fromEnv()
  return redis
}
