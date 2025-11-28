/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse
 */

import type { NextRequest } from 'next/server';

import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { getRedisClient } from '@/lib/redis/client';
import { redisCircuitBreaker } from '@/lib/redis/circuit-breaker';
import { tooManyRequests, serverError } from '@/server/api-response';
import { getSessionFromRequest } from '@/server/middleware/session';
import {
  chatRateLimit,
  enhancedRateLimit,
} from '@/server/middleware/enhanced-rate-limit';
import { logWarn, logError } from '@/utils/logger';
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
 * SECURITY (HIGH-01): Get client IP with proxy validation
 * Only trusts X-Forwarded-For from known proxy IPs to prevent spoofing
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  // Get the connecting IP (closest proxy) - last IP in X-Forwarded-For
  const connectingIp =
    realIp || (forwarded ? forwarded.split(',').pop()?.trim() : null);

  // Get trusted proxy IPs from environment
  const trustedProxiesEnv = process.env.TRUSTED_PROXY_IPS;
  const trustedProxies = trustedProxiesEnv
    ? trustedProxiesEnv.split(',').map((ip) => ip.trim())
    : [];

  let clientIp: string;

  if (
    trustedProxies.length > 0 &&
    connectingIp &&
    trustedProxies.includes(connectingIp)
  ) {
    // Request came through trusted proxy, use first X-Forwarded-For value (original client)
    clientIp = forwarded?.split(',')[0]?.trim() || 'unknown';
  } else if (
    trustedProxies.length === 0 &&
    process.env.NODE_ENV === 'production'
  ) {
    // In production without explicit trusted proxies, trust Vercel's X-Forwarded-For
    // This is a reasonable default for Vercel deployments
    clientIp = forwarded?.split(',')[0]?.trim() || connectingIp || 'unknown';
  } else {
    // Not from trusted proxy or in development, use connecting IP
    clientIp = connectingIp || 'unknown';
  }

  return clientIp;
}

/**
 * SECURITY (MED-01): Get all rate limit identifiers to track both user and IP
 * Prevents authenticated users from switching between user/IP rate limits
 * TODO: Integrate this into the rate limiting flow to fully implement MED-01
 */
function _getRateLimitIdentifiers(
  request: NextRequest,
  userId?: string,
): string[] {
  const identifiers: string[] = [];
  const clientIp = getClientIp(request);

  // Always track IP to prevent login/logout rate limit bypass
  identifiers.push(`ip:${clientIp}`);

  // Also track user if authenticated
  if (userId) {
    identifiers.push(`user:${userId}`);
  }

  return identifiers;
}

/**
 * Get identifier for rate limiting (backwards compatible)
 * Prefers user ID, falls back to IP address
 */
function getRateLimitIdentifier(request: NextRequest, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }

  return `ip:${getClientIp(request)}`;
}

/**
 * SECURITY (MED-03): Check if Redis circuit breaker is open
 * If Redis is down, we should fail closed for security
 */
function isRedisCircuitBreakerOpen(): boolean {
  return redisCircuitBreaker.getState() === 'OPEN';
}

/**
 * Rate limit middleware
 * SECURITY (CRIT-01): Fail CLOSED on Redis errors to prevent LLM cost abuse
 * SECURITY (CRIT-03): Never disable rate limiting in production
 */
export async function withRateLimit(
  request: NextRequest,
  config: {
    maxRequests: number;
    windowSeconds: number;
    keyPrefix?: string;
  } = RATE_LIMITS.API_DEFAULT,
): Promise<{ allowed: boolean; error?: Response }> {
  // SECURITY (CRIT-03): Never disable rate limiting in production
  if (process.env.ENABLE_RATE_LIMITING === 'false') {
    if (process.env.NODE_ENV === 'production') {
      logError(
        'CRITICAL: Attempted to disable rate limiting in production - ignoring',
        null,
        {
          endpoint: request.nextUrl.pathname,
        },
      );
      // Fall through to normal rate limiting - do NOT return early
    } else {
      logWarn(
        'Rate limiting disabled via environment variable (non-production)',
      );
      return { allowed: true };
    }
  }

  // SECURITY (MED-03): Check Redis circuit breaker state before attempting rate limit check
  if (isRedisCircuitBreakerOpen()) {
    logError(
      'Rate limiting unavailable - Redis circuit breaker open - denying request',
      null,
      {
        endpoint: request.nextUrl.pathname,
      },
    );
    return {
      allowed: false,
      error: serverError(
        'Service temporarily unavailable. Please try again in a few moments.',
      ),
    };
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
          { retryAfter, limit: result.limit },
        ),
      };
    }

    return { allowed: true };
  } catch (error) {
    // SECURITY (CRIT-01): Fail CLOSED on rate limit errors to prevent LLM cost abuse
    logError('Rate limit check failed - failing closed for security', error, {
      endpoint: request.nextUrl.pathname,
    });
    return {
      allowed: false,
      error: serverError(
        'Rate limiting service temporarily unavailable. Please try again.',
      ),
    };
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
 * SECURITY (HIGH-02): Consolidated rate limiting - single limiter instead of duplicate
 * SECURITY (HIGH-03): Uses global LLM rate limit to protect against cost abuse
 */
export function withChatRateLimit(
  handler: (request: NextRequest, context?: unknown) => Promise<Response>,
): (request: NextRequest, context?: unknown) => Promise<Response> {
  // SECURITY (HIGH-02): Removed duplicate rate limiter - only use chatRateLimit
  // Previously this applied BOTH chatRateLimit AND requireRateLimit, causing inconsistency

  return async (request: NextRequest, context?: unknown) => {
    let userId: string | null = null;

    try {
      const session = await getSessionFromRequest(request);
      userId = session?.userId ?? null;
    } catch (error) {
      logWarn('Failed to read session for chat rate limit', { error });
    }

    // SECURITY (HIGH-03): Check global LLM rate limit first (shared across all LLM endpoints)
    const { allowed: globalAllowed, error: globalError } =
      await checkGlobalLLMRateLimit(request, userId);
    if (!globalAllowed && globalError) {
      return globalError;
    }

    // Then check chat-specific rate limit
    const { allowed, error } = await chatRateLimit(request, userId);

    if (!allowed && error) {
      return error;
    }

    return handler(request, context);
  };
}

/**
 * SECURITY (HIGH-03): Global LLM rate limit shared across all LLM-calling endpoints
 * Prevents abuse by hitting multiple endpoints (/api/chat and /api/chat/stream)
 */
async function checkGlobalLLMRateLimit(
  request: NextRequest,
  userId: string | null,
): Promise<{ allowed: boolean; error?: Response }> {
  // SECURITY (MED-03): Check Redis circuit breaker first
  if (isRedisCircuitBreakerOpen()) {
    logError(
      'Global LLM rate limit unavailable - Redis circuit breaker open',
      null,
      {
        endpoint: request.nextUrl.pathname,
      },
    );
    return {
      allowed: false,
      error: serverError(
        'Service temporarily unavailable. Please try again in a few moments.',
      ),
    };
  }

  try {
    const redis = getRedisClient();
    const identifier = userId ? `user:${userId}` : `ip:${getClientIp(request)}`;

    const result = await checkRateLimit(
      redis,
      identifier,
      RATE_LIMITS.LLM_GLOBAL,
    );

    if (!result.allowed) {
      logWarn('Global LLM rate limit exceeded', {
        identifier,
        limit: result.limit,
        resetAt: result.resetAt,
        endpoint: request.nextUrl.pathname,
      });

      const retryAfter = Math.ceil(
        (result.resetAt.getTime() - Date.now()) / MILLISECONDS_PER_SECOND,
      );

      return {
        allowed: false,
        error: tooManyRequests(
          `Too many AI requests. Please try again in ${retryAfter} seconds.`,
          { retryAfter, limit: result.limit, type: 'llm_global' },
        ),
      };
    }

    return { allowed: true };
  } catch (error) {
    // SECURITY: Fail CLOSED for LLM rate limiting
    logError('Global LLM rate limit check failed - failing closed', error, {
      endpoint: request.nextUrl.pathname,
    });
    return {
      allowed: false,
      error: serverError(
        'Rate limiting service temporarily unavailable. Please try again.',
      ),
    };
  }
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
    const { allowed, error } = await enhancedRateLimit(
      request,
      identifier,
      'auth',
      {
        windowMs: AUTH_WINDOW_MS,
        maxRequests: AUTH_MAX_REQUESTS,
        lockoutThreshold: AUTH_LOCKOUT_THRESHOLD,
        lockoutDurationMs: AUTH_LOCKOUT_DURATION_MS,
        enableProgressiveDelay: true,
        enableAccountLockout: true,
      },
    );

    if (!allowed && error) {
      return error;
    }

    return limitedHandler(request, context);
  };
}
