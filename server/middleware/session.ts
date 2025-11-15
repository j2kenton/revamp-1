/**
 * Session Middleware
 * Handles session management for API routes
 */

import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

import { getSession, refreshSession } from '@/lib/redis/session';
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

/**
 * Get session from request
 */
export async function getSessionFromRequest(
  request: NextRequest,
): Promise<SessionModel | null> {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  const session = await getSession(sessionId);

  if (!session) {
    logWarn('Invalid session ID in cookie', { sessionId });
    return null;
  }

  // Check if session is expired
  if (session.expiresAt < new Date()) {
    logWarn('Session expired', { sessionId });
    return null;
  }

  // Refresh session TTL on access
  await refreshSession(sessionId);

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
