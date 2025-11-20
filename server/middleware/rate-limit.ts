/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse
 */

import type { NextRequest } from 'next/server';

import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { getRedisClient } from '@/lib/redis/client';
import { tooManyRequests } from '@/server/api-response';
import { getSessionFromRequest } from '@/server/middleware/session';
import { chatRateLimit, enhancedRateLimit } from '@/server/middleware/enhanced-rate-limit';
import { logWarn } from '@/utils/logger';
import {
  FIFTEEN_MINUTES_IN_MS,
  MILLISECONDS_PER_SECOND,
  ONE_MINUTE_IN_MS,
} from '@/lib/constants/common';

const AUTH_WINDOW_MS = ONE_MINUTE_IN_MS;
const AUTH_MAX_REQUESTS = 10;
const AUTH_LOCKOUT_THRESHOLD = 5;
const AUTH_LOCKOUT_DURATION_MS = FIFTEEN_MINUTES_IN_MS;

/**
 * Get identifier for rate limiting
 * Prefers user ID, falls back to IP address
 */
function getRateLimitIdentifier(request: NextRequest, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }

  // Get IP from headers (works with proxies like Vercel)
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';

  return `ip:${ip}`;
}

/**
 * Rate limit middleware
 */
export async function withRateLimit(
  request: NextRequest,
  config: {
    maxRequests: number;
    windowSeconds: number;
    keyPrefix?: string;
  } = RATE_LIMITS.API_DEFAULT,
): Promise<{ allowed: boolean; error?: Response }> {
  // Skip if rate limiting is disabled
  if (process.env.ENABLE_RATE_LIMITING === 'false') {
    return { allowed: true };
  }

  try {
    const redis = getRedisClient();
    const session = await getSessionFromRequest(request);
    const identifier = getRateLimitIdentifier(request, session?.userId);

    const result = await checkRateLimit(redis, identifier, config);

    if (!result.allowed) {
      logWarn('Rate limit exceeded', {
        identifier,
        limit: result.limit,
        resetAt: result.resetAt,
      });

      const retryAfter = Math.ceil(
        (result.resetAt.getTime() - Date.now()) / MILLISECONDS_PER_SECOND,
      );

      return {
        allowed: false,
        error: tooManyRequests(
          `Too many requests. Please try again in ${retryAfter} seconds.`,
          { retryAfter, limit: result.limit }
        ),
      };
    }

    return { allowed: true };
  } catch (error) {
    // On error, fail open (allow request) but log
    logWarn('Rate limit check failed', { error });
    return { allowed: true };
  }
}

/**
 * Wrap route handler with rate limiting
 */
export function requireRateLimit(
  config: {
    maxRequests: number;
    windowSeconds: number;
    keyPrefix?: string;
  } = RATE_LIMITS.API_DEFAULT,
  handler: (request: NextRequest, context?: unknown) => Promise<Response>,
): (request: NextRequest, context?: unknown) => Promise<Response> {
  return async (request: NextRequest, context?: unknown) => {
    const { allowed, error } = await withRateLimit(request, config);

    if (!allowed && error) {
      return error;
    }

    return handler(request, context);
  };
}

/**
 * Rate limit for chat endpoints
 */
export function withChatRateLimit(
  handler: (request: NextRequest, context?: unknown) => Promise<Response>,
): (request: NextRequest, context?: unknown) => Promise<Response> {
  const limitedHandler = requireRateLimit(RATE_LIMITS.CHAT_MESSAGE, handler);

  return async (request: NextRequest, context?: unknown) => {
    let userId: string | null = null;

    try {
      const session = await getSessionFromRequest(request);
      userId = session?.userId ?? null;
    } catch (error) {
      logWarn('Failed to read session for chat rate limit', { error });
    }

    const { allowed, error } = await chatRateLimit(request, userId);

    if (!allowed && error) {
      return error;
    }

    return limitedHandler(request, context);
  };
}

/**
 * Rate limit for auth endpoints
 */
export function withAuthRateLimit(
  handler: (request: NextRequest, context?: unknown) => Promise<Response>,
): (request: NextRequest, context?: unknown) => Promise<Response> {
  const limitedHandler = requireRateLimit(RATE_LIMITS.AUTH, handler);

  return async (request: NextRequest, context?: unknown) => {
    const identifier = getRateLimitIdentifier(request);
    const { allowed, error } = await enhancedRateLimit(request, identifier, 'auth', {
      windowMs: AUTH_WINDOW_MS,
      maxRequests: AUTH_MAX_REQUESTS,
      lockoutThreshold: AUTH_LOCKOUT_THRESHOLD,
      lockoutDurationMs: AUTH_LOCKOUT_DURATION_MS,
      enableProgressiveDelay: true,
      enableAccountLockout: true,
    });

    if (!allowed && error) {
      return error;
    }

    return limitedHandler(request, context);
  };
}
