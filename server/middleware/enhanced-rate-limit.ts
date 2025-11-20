/**
 * Enhanced Rate Limiting Middleware
 * Implements progressive delays and account lockout
 */

import type { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis/client';
import { withCircuitBreaker } from '@/lib/redis/circuit-breaker';
import { tooManyRequests } from '@/server/api-response';
import { logWarn, logError } from '@/utils/logger';
import {
  MILLISECONDS_PER_SECOND,
  ONE_HOUR_IN_MS,
  ONE_MINUTE_IN_MS,
  ONE_SECOND_IN_MS,
  FIFTEEN_MINUTES_IN_MS,
  SECONDS_PER_MINUTE,
  MINUTES_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
} from '@/lib/constants/common';
import { BACKOFF_EXPONENT, MIN_RETRY_AFTER_SECONDS } from '@/lib/constants/retry';

const DEFAULT_WINDOW_MS = ONE_MINUTE_IN_MS;
const DEFAULT_MAX_REQUESTS = 10;
const DEFAULT_BLOCK_DURATION_MS = FIFTEEN_MINUTES_IN_MS;
const DEFAULT_LOCKOUT_THRESHOLD = 5;
const DEFAULT_LOCKOUT_DURATION_MS = ONE_HOUR_IN_MS;
const NO_DELAY = 0;
const BACKOFF_INITIAL_ATTEMPT = 1;
const MAX_BACKOFF_MS = 30 * ONE_SECOND_IN_MS;
const ATTEMPT_RESET_SECONDS = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
const MILLISECONDS_TO_MINUTES = MILLISECONDS_PER_MINUTE;
const CHAT_WINDOW_MS = ONE_MINUTE_IN_MS;
const CHAT_MAX_REQUESTS = 20;
const CHAT_LOCKOUT_THRESHOLD = 3;
const CHAT_LOCKOUT_DURATION_MS = FIFTEEN_MINUTES_IN_MS;

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  blockDurationMs: number; // How long to block after exceeding limit
  enableProgressiveDelay: boolean; // Enable progressive delays
  enableAccountLockout: boolean; // Enable account lockout
  lockoutThreshold: number; // Failures before lockout
  lockoutDurationMs: number; // How long to lock out
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: DEFAULT_WINDOW_MS,
  maxRequests: DEFAULT_MAX_REQUESTS,
  blockDurationMs: DEFAULT_BLOCK_DURATION_MS,
  enableProgressiveDelay: true,
  enableAccountLockout: true,
  lockoutThreshold: DEFAULT_LOCKOUT_THRESHOLD,
  lockoutDurationMs: DEFAULT_LOCKOUT_DURATION_MS,
};

/**
 * Calculate progressive delay based on attempt count
 */
function calculateProgressiveDelay(attemptCount: number): number {
  if (attemptCount <= 0) return NO_DELAY;

  // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
  return Math.min(Math.pow(BACKOFF_EXPONENT, attemptCount - BACKOFF_INITIAL_ATTEMPT) * MILLISECONDS_PER_SECOND, MAX_BACKOFF_MS);
}

/**
 * Enhanced rate limiting with progressive delays and lockout
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Next.js Request doesn't expose .ip; fall back to remote address on the socket when available
  const anyReq = request as unknown as { socket?: { remoteAddress?: string } };
  if (anyReq.socket?.remoteAddress) {
    return anyReq.socket.remoteAddress;
  }

  return 'unknown';
}

/**
 * Enhanced rate limiting with progressive delays and lockout
 */
export async function enhancedRateLimit(
  request: NextRequest,
  identifier: string,
  endpoint: string,
  config: Partial<RateLimitConfig> = {}
): Promise<{ allowed: boolean; error?: Response; retryAfter?: number }> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const redis = getRedisClient();

  const rateLimitKey = `ratelimit:${endpoint}:${identifier}`;
  const lockoutKey = `lockout:${endpoint}:${identifier}`;
  const attemptKey = `attempts:${endpoint}:${identifier}`;

  try {
    // Check if account is locked out
    if (fullConfig.enableAccountLockout) {
      const isLockedOut = await withCircuitBreaker(
        async () => {
          const lockout = await redis.get(lockoutKey);
          return lockout !== null;
        },
        () => false // Fallback: allow request if Redis is down
      );

      if (isLockedOut) {
        const ttl = await redis.ttl(lockoutKey);
        const retryAfter = Math.max(ttl, MIN_RETRY_AFTER_SECONDS);

        logWarn('Account locked out', {
          identifier,
          endpoint,
          retryAfter,
        });

        return {
          allowed: false,
          retryAfter,
          error: tooManyRequests(
            `Account temporarily locked. Please try again in ${Math.ceil(retryAfter / MIN_RETRY_AFTER_SECONDS)} minutes.`,
            {
              retryAfter,
              lockoutRemaining: retryAfter,
            }
          ),
        };
      }
    }

    // Check rate limit
    const currentCount = await withCircuitBreaker(
      async () => {
        const count = await redis.incr(rateLimitKey);

        if (count === 1) {
          // First request in window, set expiry
          await redis.pexpire(rateLimitKey, fullConfig.windowMs);
        }

        return count;
      },
      () => 0 // Fallback: allow request if Redis is down
    );

    if (currentCount > fullConfig.maxRequests) {
      // Rate limit exceeded
      const ttl = await redis.pttl(rateLimitKey);
      const retryAfter = Math.max(Math.ceil(ttl / MILLISECONDS_PER_SECOND), MIN_RETRY_AFTER_SECONDS);

      // Increment attempt counter
      if (fullConfig.enableAccountLockout) {
        const attempts = await redis.incr(attemptKey);

        if (attempts === 1) {
          await redis.expire(attemptKey, ATTEMPT_RESET_SECONDS);
        }

        // Check if lockout threshold exceeded
        if (attempts >= fullConfig.lockoutThreshold) {
          await redis.setex(
            lockoutKey,
            Math.ceil(fullConfig.lockoutDurationMs / MILLISECONDS_PER_SECOND),
            'locked'
          );

          logWarn('Account locked due to excessive failures', {
            identifier,
            endpoint,
            attempts,
          });

          return {
            allowed: false,
            retryAfter: Math.ceil(fullConfig.lockoutDurationMs / MILLISECONDS_PER_SECOND),
            error: tooManyRequests(
              `Account locked due to too many failed attempts. Please try again in ${Math.ceil(fullConfig.lockoutDurationMs / MILLISECONDS_TO_MINUTES)} minutes.`,
              {
                retryAfter: Math.ceil(fullConfig.lockoutDurationMs / MILLISECONDS_PER_SECOND),
                lockoutDuration: fullConfig.lockoutDurationMs,
              }
            ),
          };
        }

        // Apply progressive delay
        if (fullConfig.enableProgressiveDelay) {
          const delay = calculateProgressiveDelay(attempts);

          if (delay > NO_DELAY) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      logWarn('Rate limit exceeded', {
        identifier,
        endpoint,
        count: currentCount,
        limit: fullConfig.maxRequests,
        retryAfter,
      });

      return {
        allowed: false,
        retryAfter,
        error: tooManyRequests(
          `Too many requests. Please try again in ${retryAfter} seconds.`,
          {
            retryAfter,
            limit: fullConfig.maxRequests,
            windowMs: fullConfig.windowMs,
            current: currentCount,
          }
        ),
      };
    }

    // Reset attempt counter on successful request
    if (fullConfig.enableAccountLockout && currentCount <= fullConfig.maxRequests) {
      await redis.del(attemptKey);
    }

    return { allowed: true };
  } catch (error) {
    logError('Rate limiting error', error, { identifier, endpoint });

    // Fail open: allow request if rate limiting fails
    return { allowed: true };
  }
}

/**
 * Wrapper for chat-specific rate limiting
 */
export async function chatRateLimit(
  request: NextRequest,
  userId?: string | null
): Promise<{ allowed: boolean; error?: Response; retryAfter?: number }> {
  const identifier = userId
    ? `user:${userId}`
    : `ip:${getClientIp(request)}`;

  return enhancedRateLimit(request, identifier, 'chat', {
    windowMs: CHAT_WINDOW_MS,
    maxRequests: CHAT_MAX_REQUESTS,
    enableProgressiveDelay: true,
    enableAccountLockout: true,
    lockoutThreshold: CHAT_LOCKOUT_THRESHOLD,
    lockoutDurationMs: CHAT_LOCKOUT_DURATION_MS,
  });
}
