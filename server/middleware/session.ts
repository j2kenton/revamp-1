/**
 * Session Middleware
 * Handles session management for API routes
 */

import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

import { getSession, refreshSession } from '@/lib/redis/session';
import { isRedisUnavailableError } from '@/lib/redis/errors';
import { getMsalTokenFromRequest, validateMsalToken } from '@/server/middleware/msal-auth';
import type { SessionModel } from '@/types/models';
import { AuthError } from '@/utils/error-handler';
import { logWarn } from '@/utils/logger';

const SESSION_COOKIE_NAME = 'session_id';
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days
};

export const JWT_FALLBACK_PREFIX = 'jwt-fallback';

function getClientIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }

  const realIp = request.headers.get('x-real-ip');
  return realIp ?? undefined;
}

async function getSessionFromJwtFallback(
  request: NextRequest,
  reason: 'redis_unavailable' | 'missing_cookie' | 'invalid_session' | 'expired_session' = 'redis_unavailable',
): Promise<SessionModel | null> {
  const token = getMsalTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const payload = await validateMsalToken(token);
  if (!payload) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(payload.exp * 1000);
  const csrfToken = createHash('sha256').update(token).digest('hex');

  logWarn('Using JWT payload for session fallback', {
    userId: payload.oid,
    reason,
  });

  return {
    id: `${JWT_FALLBACK_PREFIX}:${payload.oid}`,
    userId: payload.oid,
    csrfToken,
    data: {
      userAgent: request.headers.get('user-agent') ?? undefined,
      ipAddress: getClientIp(request),
      email: payload.preferred_username,
      name: payload.name,
      lastActivityAt: now,
      source: 'jwt-fallback',
    },
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get session from request
 */
export async function getSessionFromRequest(
  request: NextRequest,
): Promise<SessionModel | null> {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return getSessionFromJwtFallback(request, 'missing_cookie');
  }

  let session: SessionModel | null = null;

  try {
    session = await getSession(sessionId);
  } catch (error) {
    if (isRedisUnavailableError(error)) {
      logWarn('Redis unavailable, attempting JWT fallback for session', {
        sessionId,
      });
      return getSessionFromJwtFallback(request, 'redis_unavailable');
    }

    logWarn('Failed to retrieve session', { sessionId, error });
    return getSessionFromJwtFallback(request, 'invalid_session');
  }

  if (!session) {
    logWarn('Invalid session ID in cookie', { sessionId });
    return getSessionFromJwtFallback(request, 'invalid_session');
  }

  // Check if session is expired
  if (session.expiresAt < new Date()) {
    logWarn('Session expired', { sessionId });
    return getSessionFromJwtFallback(request, 'expired_session');
  }

  // Refresh session TTL on access
  if (!session.id.startsWith(JWT_FALLBACK_PREFIX)) {
    await refreshSession(sessionId);
  }

  return session;
}

/**
 * Set session cookie
 */
export async function setSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, SESSION_COOKIE_OPTIONS);
}

/**
 * Clear session cookie
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Require authenticated session
 * Returns session or throws error
 */
export async function requireSession(
  request: NextRequest,
): Promise<SessionModel> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    throw new AuthError('Unauthorized');
  }

  return session;
}

/**
 * Get CSRF token from request headers
 */
export function getCsrfTokenFromRequest(request: NextRequest): string | null {
  return request.headers.get('x-csrf-token');
}

/**
 * Check if request method requires CSRF protection
 */
export function requiresCsrfProtection(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}
