/**
 * Enhanced Rate Limiting Middleware
 * Implements progressive delays and account lockout
 */

import type { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis/client';
import { withCircuitBreaker } from '@/lib/redis/circuit-breaker';
import { tooManyRequests } from '@/server/api-response';
import { logWarn, logError } from '@/utils/logger';

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
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  blockDurationMs: 15 * 60 * 1000, // 15 minutes
  enableProgressiveDelay: true,
  enableAccountLockout: true,
  lockoutThreshold: 5,
  lockoutDurationMs: 60 * 60 * 1000, // 1 hour
};

/**
 * Calculate progressive delay based on attempt count
 */
function calculateProgressiveDelay(attemptCount: number): number {
  if (attemptCount <= 0) return 0;

  // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
  return Math.min(Math.pow(2, attemptCount - 1) * 1000, 30000);
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
        const retryAfter = Math.max(ttl, 60); // At least 60 seconds

        logWarn('Account locked out', {
          identifier,
          endpoint,
          retryAfter,
        });

        return {
          allowed: false,
          retryAfter,
          error: tooManyRequests(
            `Account temporarily locked. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
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
      const retryAfter = Math.max(Math.ceil(ttl / 1000), 60);

      // Increment attempt counter
      if (fullConfig.enableAccountLockout) {
        const attempts = await redis.incr(attemptKey);

        if (attempts === 1) {
          await redis.expire(attemptKey, 3600); // Reset after 1 hour
        }

        // Check if lockout threshold exceeded
        if (attempts >= fullConfig.lockoutThreshold) {
          await redis.setex(
            lockoutKey,
            Math.ceil(fullConfig.lockoutDurationMs / 1000),
            'locked'
          );

          logWarn('Account locked due to excessive failures', {
            identifier,
            endpoint,
            attempts,
          });

          return {
            allowed: false,
            retryAfter: Math.ceil(fullConfig.lockoutDurationMs / 1000),
            error: tooManyRequests(
              `Account locked due to too many failed attempts. Please try again in ${Math.ceil(fullConfig.lockoutDurationMs / 60000)} minutes.`,
              {
                retryAfter: Math.ceil(fullConfig.lockoutDurationMs / 1000),
                lockoutDuration: fullConfig.lockoutDurationMs,
              }
            ),
          };
        }

        // Apply progressive delay
        if (fullConfig.enableProgressiveDelay) {
          const delay = calculateProgressiveDelay(attempts);

          if (delay > 0) {
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
  userId: string
): Promise<{ allowed: boolean; error?: Response; retryAfter?: number }> {
  return enhancedRateLimit(request, userId, 'chat', {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 messages per minute
    enableProgressiveDelay: true,
    enableAccountLockout: true,
    lockoutThreshold: 3, // Lock after 3 violations
    lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
  });
}
