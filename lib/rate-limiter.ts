/**
 * Rate Limiting Utilities
 * Redis-based sliding window rate limiter with fallback (HIGH-03)
 */

import type { Redis } from 'ioredis';
import {
  MILLISECONDS_PER_SECOND,
  PARSE_INT_RADIX,
} from '@/lib/constants/common';
import { logError, logWarn } from '@/utils/logger';

/**
 * In-memory rate limiter fallback for when Redis is unavailable
 * SECURITY (HIGH-03): Provides fallback to prevent fail-open on Redis failure
 * SECURITY (LOW-01): Instance-aware limiting accounts for multiple server instances
 */
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();
const IN_MEMORY_CLEANUP_INTERVAL_MS = 60000; // Clean up every minute

/**
 * SECURITY (LOW-01): Estimated number of application instances
 * In multi-instance deployments, rate limits are per-instance when using in-memory fallback
 * We reduce the per-instance limit to account for this
 */
const INSTANCE_COUNT_ESTIMATE = parseInt(process.env.INSTANCE_COUNT || '1', 10);

// Periodically clean up expired entries
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of inMemoryStore.entries()) {
      if (value.resetAt < now) {
        inMemoryStore.delete(key);
      }
    }
  }, IN_MEMORY_CLEANUP_INTERVAL_MS);
}

function inMemoryRateLimiter(
  identifier: string,
  config: RateLimitConfig,
): RateLimitResult {
  const { maxRequests, windowSeconds, keyPrefix = 'ratelimit' } = config;
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();
  const windowMs = windowSeconds * MILLISECONDS_PER_SECOND;

  // SECURITY (LOW-01): Adjust rate limit for multi-instance deployments
  // When using in-memory fallback, each instance has its own store
  // So we reduce the per-instance limit to approximate the global limit
  const adjustedMaxRequests = Math.max(
    1,
    Math.ceil(maxRequests / INSTANCE_COUNT_ESTIMATE),
  );

  if (INSTANCE_COUNT_ESTIMATE > 1) {
    logWarn(
      'Using adjusted in-memory rate limit for multi-instance deployment',
      {
        originalLimit: maxRequests,
        adjustedLimit: adjustedMaxRequests,
        instanceCount: INSTANCE_COUNT_ESTIMATE,
        identifier,
      },
    );
  }

  const existing = inMemoryStore.get(key);

  if (existing && existing.resetAt > now) {
    // Within window
    if (existing.count >= adjustedMaxRequests) {
      return {
        allowed: false,
        limit: adjustedMaxRequests,
        remaining: 0,
        resetAt: new Date(existing.resetAt),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      limit: adjustedMaxRequests,
      remaining: adjustedMaxRequests - existing.count,
      resetAt: new Date(existing.resetAt),
    };
  }

  // New window
  const resetAt = now + windowMs;
  inMemoryStore.set(key, { count: 1, resetAt });

  return {
    allowed: true,
    limit: adjustedMaxRequests,
    remaining: adjustedMaxRequests - 1,
    resetAt: new Date(resetAt),
  };
}

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

      const resetAt = new Date(
        oldestTimestamp + windowSeconds * MILLISECONDS_PER_SECOND,
      );

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
    // SECURITY (HIGH-03): Fail closed for auth endpoints, use in-memory fallback for others
    logError('Rate limiter Redis error, using fallback', error, {
      key,
      identifier,
    });

    // Check if this is a critical endpoint (auth, login)
    const isCriticalEndpoint =
      keyPrefix?.includes('auth') || keyPrefix?.includes('login');

    if (isCriticalEndpoint) {
      // Fail CLOSED for auth endpoints - deny request when Redis is down
      logWarn('Rate limiter failing closed for auth endpoint', {
        key,
        identifier,
      });
      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        resetAt: new Date(now + windowSeconds * MILLISECONDS_PER_SECOND),
      };
    }

    // Use in-memory fallback for non-critical endpoints
    logWarn('Rate limiter using in-memory fallback', { key, identifier });
    return inMemoryRateLimiter(identifier, config);
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
  /**
   * SECURITY (HIGH-03): Per-identity LLM rate limit, shared across every
   * LLM-calling endpoint. One bucket per user (or per IP when signed out)
   * covers `/api/chat` and `/api/chat/stream` together, so an abuser can't
   * get a fresh allowance by switching endpoints.
   *
   * NOTE: this is deliberately *not* an app-wide aggregate cap — it bounds
   * what any single identity can spend, not what the deployment can spend in
   * total. An attacker rotating both identity and IP is bounded by this only
   * per-identity; a true spend ceiling would need a single un-keyed counter.
   */
  LLM_PER_IDENTITY: {
    maxRequests: 15,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:zset:llm-per-identity',
  },
  /**
   * SECURITY (HIGH-03): Deployment-wide LLM spend ceiling.
   *
   * Per-identity limits bound what one account or IP can spend, but an
   * attacker who rotates both gets a fresh allowance every time — you don't
   * win that arms race by tightening per-identity limits. This is the
   * backstop: a single counter with no identifier in the key, so *every*
   * LLM request in the deployment shares one budget.
   *
   * Sized as an operational cost ceiling, not a UX limit — a legitimate
   * user base should never reach it, and reaching it means something is
   * wrong. Requests over the ceiling are rejected with a 429 carrying
   * `type: 'llm_aggregate'`; unlike the LLM circuit breaker, there is no
   * degraded fallback reply, because the point is to stop spending.
   */
  LLM_AGGREGATE: {
    maxRequests: 500,
    windowSeconds: 3600,
    keyPrefix: 'ratelimit:zset:llm-aggregate',
  },
} as const;
