/**
 * Rate Limiting Utilities
 * Redis-based sliding window rate limiter
 */

import type { Redis } from 'ioredis';

const MILLISECONDS_PER_SECOND = 1000;
const ZRANGE_START_INDEX = 0;
const ZRANGE_LIMIT_ONE = 0;
const SCORE_INDEX_IN_RESULT = 1;
const PARSE_INT_RADIX = 10;

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the window
   */
  maxRequests: number;

  /**
   * Time window in seconds
   */
  windowSeconds: number;

  /**
   * Optional key prefix for Redis keys
   */
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Check if a request should be rate limited
 * Uses sliding window algorithm for accurate rate limiting
 */
export async function checkRateLimit(
  redis: Redis,
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { maxRequests, windowSeconds, keyPrefix = 'ratelimit' } = config;
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * MILLISECONDS_PER_SECOND;

  try {
    // Remove old entries outside the current window
    await redis.zremrangebyscore(key, ZRANGE_START_INDEX, windowStart);

    // Count requests in the current window
    const requestCount = await redis.zcard(key);

    if (requestCount >= maxRequests) {
      // Get the oldest request timestamp to calculate reset time
      const oldestTimestamps = await redis.zrange(key, ZRANGE_START_INDEX, ZRANGE_LIMIT_ONE, 'WITHSCORES');
      const oldestTimestamp =
        oldestTimestamps.length > SCORE_INDEX_IN_RESULT ? parseInt(oldestTimestamps[SCORE_INDEX_IN_RESULT], PARSE_INT_RADIX) : now;

      const resetAt = new Date(oldestTimestamp + windowSeconds * MILLISECONDS_PER_SECOND);

      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        resetAt,
      };
    }

    // Add current request
    await redis.zadd(key, now, `${now}-${Math.random()}`);

    // Set expiration on the key
    await redis.expire(key, windowSeconds);

    const resetAt = new Date(now + windowSeconds * MILLISECONDS_PER_SECOND);

    return {
      allowed: true,
      limit: maxRequests,
      remaining: maxRequests - requestCount - 1,
      resetAt,
    };
  } catch (error) {
    // On Redis failure, fail open (allow request) but log the error
    console.error('Rate limiter error:', error);

    return {
      allowed: true,
      limit: maxRequests,
      remaining: maxRequests,
      resetAt: new Date(now + windowSeconds * MILLISECONDS_PER_SECOND),
    };
  }
}

/**
 * Create a rate limiter function with preset configuration
 */
export function createRateLimiter(redis: Redis, config: RateLimitConfig) {
  return (identifier: string) => checkRateLimit(redis, identifier, config);
}

/**
 * Standard rate limit configurations
 */
export const RATE_LIMITS = {
  CHAT_MESSAGE: {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:chat',
  },
  API_DEFAULT: {
    maxRequests: 100,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:api',
  },
  AUTH: {
    maxRequests: 5,
    windowSeconds: 300,
    keyPrefix: 'ratelimit:auth',
  },
} as const;
