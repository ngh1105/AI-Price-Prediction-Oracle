/**
 * ⚠️ WARNING: Simple in-memory rate limiting for API routes
 * 
 * This implementation is NOT suitable for production and is FUNDAMENTALLY INCOMPATIBLE
 * with serverless deployments (Vercel, AWS Lambda, Cloudflare Workers, etc.) because:
 * 
 * - Each function instance has isolated memory
 * - Rate limits are NOT enforced across instances
 * - Multiple instances can each allow the full limit, effectively bypassing rate limiting
 * 
 * For production, you MUST use a centralized store:
 * - Redis (e.g., Upstash Redis for serverless)
 * - DynamoDB with TTL
 * - Managed rate-limiting service (e.g., Upstash Rate Limit, Cloudflare Rate Limiting)
 * - Platform-provided solutions (e.g., Vercel Edge Config, AWS API Gateway throttling)
 * 
 * Example migration to Redis:
 * ```typescript
 * import { Ratelimit } from '@upstash/ratelimit'
 * import { Redis } from '@upstash/redis'
 * 
 * const ratelimit = new Ratelimit({
 *   redis: Redis.fromEnv(),
 *   limiter: Ratelimit.slidingWindow(30, '1 m'),
 * })
 * ```
 * 
 * See: https://upstash.com/docs/redis/overall/getstarted
 *      https://vercel.com/docs/edge-network/rate-limiting
 */

interface RateLimitStore {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitStore>()

const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 30 // Default: 30 requests per minute per IP

export interface RateLimitOptions {
  maxRequests?: number
  windowMs?: number
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
  const now = Date.now()
  const key = identifier
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS_PER_WINDOW
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS

  // Serverless-safe lazy cleanup: remove up to 5 expired entries per call
  // This avoids unbounded work while preventing memory leaks
  let cleaned = 0
  const MAX_CLEANUP_PER_CALL = 5
  for (const [storeKey, store] of rateLimitStore.entries()) {
    if (cleaned >= MAX_CLEANUP_PER_CALL) break
    if (now > store.resetTime) {
      rateLimitStore.delete(storeKey)
      cleaned++
    }
  }

  let store = rateLimitStore.get(key)

  // Clean up expired entry for this key if needed
  if (store && now > store.resetTime) {
    rateLimitStore.delete(key)
    store = undefined
  }

  // Create new entry if needed
  if (!store) {
    store = {
      count: 0,
      resetTime: now + windowMs,
    }
    rateLimitStore.set(key, store)
  }

  // Check if limit exceeded
  if (store.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: store.resetTime,
      limit: maxRequests,
    }
  }

  // Increment count
  store.count++

  return {
    allowed: true,
    remaining: maxRequests - store.count,
    resetAt: store.resetTime,
    limit: maxRequests,
  }
}

