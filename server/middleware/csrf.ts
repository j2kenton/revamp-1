/**
 * CSRF Protection Middleware
 * Validates CSRF tokens for state-changing requests
 */

import type { NextRequest } from 'next/server';

import { validateCsrfToken } from '@/lib/redis/session';
import {
  getSessionFromRequest,
  getCsrfTokenFromRequest,
  requiresCsrfProtection,
} from '@/server/middleware/session';
import { unauthorized } from '@/server/api-response';
import { logWarn } from '@/utils/logger';

/**
 * CSRF protection middleware
 * Validates CSRF token for state-changing requests
 */
export async function withCsrfProtection(
  request: NextRequest,
): Promise<{ valid: boolean; error?: Response }> {
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
