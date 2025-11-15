/**
 * Simple in-memory rate limiting for API routes
 * For production, consider using Redis or a dedicated rate limiting service
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

  let store = rateLimitStore.get(key)

  // Clean up expired entries
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

// Clean up old entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, store] of rateLimitStore.entries()) {
      if (now > store.resetTime) {
        rateLimitStore.delete(key)
      }
    }
  }, RATE_LIMIT_WINDOW_MS)
}

