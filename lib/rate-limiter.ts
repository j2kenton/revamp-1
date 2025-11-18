/**
 * Rate Limiting Utilities
 * Redis-based sliding window rate limiter
 */

import type { Redis } from 'ioredis';
import { MILLISECONDS_PER_SECOND, PARSE_INT_RADIX } from '@/lib/constants/common';
import { logError } from '@/utils/logger';

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
    await redis.zremrangebyscore(key, 0, windowStart);

    // Count requests in the current window (fallback for mocks without zcard)
    const members = await redis.zrange(key, 0, -1);
    const requestCount = members.length;

    if (requestCount >= maxRequests) {
      // Get the oldest request timestamp (extract timestamp prefix from member)
      const oldestMember = members[0];
      let oldestTimestamp = now;
      if (oldestMember) {
        const [timestampPart] = oldestMember.split('-');
        const parsedTimestamp = parseInt(timestampPart, PARSE_INT_RADIX);
        if (!Number.isNaN(parsedTimestamp)) {
          oldestTimestamp = parsedTimestamp;
        }
      }

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
    logError('Rate limiter error', error, { key, identifier });

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
    keyPrefix: 'ratelimit:zset:chat',
  },
  API_DEFAULT: {
    maxRequests: 100,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:zset:api',
  },
  AUTH: {
    maxRequests: 5,
    windowSeconds: 300,
    keyPrefix: 'ratelimit:zset:auth',
  },
} as const;
