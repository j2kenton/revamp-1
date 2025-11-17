/**
 * CSRF Protection Middleware
 * Validates CSRF tokens for state-changing requests
 */

import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';

import { validateCsrfToken } from '@/lib/redis/session';
import {
  getSessionFromRequest,
  getCsrfTokenFromRequest,
  requiresCsrfProtection,
  JWT_FALLBACK_PREFIX,
} from '@/server/middleware/session';
import { getMsalTokenFromRequest } from '@/server/middleware/msal-auth';
import { unauthorized } from '@/server/api-response';
import { logWarn } from '@/utils/logger';
import { isTestAuthRequest } from '@/server/utils/test-auth';

/**
 * CSRF protection middleware
 * Validates CSRF token for state-changing requests
 */
export async function withCsrfProtection(
  request: NextRequest,
): Promise<{ valid: boolean; error?: Response }> {
  if (process.env.BYPASS_AUTH === 'true' || isTestAuthRequest(request)) {
    return { valid: true };
  }

  // Skip CSRF check for safe methods
  if (!requiresCsrfProtection(request.method)) {
    return { valid: true };
  }

  // Get session
  const session = await getSessionFromRequest(request);

  if (!session) {
    logWarn('CSRF check failed: No session');
    return {
      valid: false,
      error: unauthorized('No active session'),
    };
  }

  // Get CSRF token from request
  const csrfToken = getCsrfTokenFromRequest(request);

  if (!csrfToken) {
    logWarn('CSRF check failed: Missing token', { sessionId: session.id });
    return {
      valid: false,
      error: unauthorized('Missing CSRF token'),
    };
  }

  // Validate CSRF token
  if (session.id.startsWith(JWT_FALLBACK_PREFIX)) {
    const fallbackToken = getMsalTokenFromRequest(request);
    if (!fallbackToken) {
      logWarn('CSRF fallback failed: Missing MSAL token', { sessionId: session.id });
      return {
        valid: false,
        error: unauthorized('Invalid CSRF token'),
      };
    }
    const expected = createHash('sha256').update(fallbackToken).digest('hex');
    if (expected !== csrfToken) {
      logWarn('CSRF fallback failed: Token mismatch', { sessionId: session.id });
      return {
        valid: false,
        error: unauthorized('Invalid CSRF token'),
      };
    }

    return { valid: true };
  }

  const isValid = await validateCsrfToken(session.id, csrfToken);

  if (!isValid) {
    logWarn('CSRF check failed: Invalid token', { sessionId: session.id });
    return {
      valid: false,
      error: unauthorized('Invalid CSRF token'),
    };
  }

  return { valid: true };
}

/**
 * Wrap route handler with CSRF protection
 */
export function requireCsrfToken(
  handler: (request: NextRequest, context?: unknown) => Promise<Response>,
): (request: NextRequest, context?: unknown) => Promise<Response> {
  return async (request: NextRequest, context?: unknown) => {
    const { valid, error } = await withCsrfProtection(request);

    if (!valid && error) {
      return error;
    }

    return handler(request, context);
  };
}
