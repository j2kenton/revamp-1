/**
 * MSAL Authentication Middleware
 * Validates MSAL tokens and creates/updates sessions
 */

import type { NextRequest } from 'next/server';
import { AuthError } from '@/utils/error-handler';
import { logError, logWarn } from '@/utils/logger';
import { createSession, getSession } from '@/lib/redis/session';
import type { SessionModel } from '@/types/models';

interface MsalTokenPayload {
  oid: string; // Object ID (user ID)
  preferred_username: string; // Email
  name: string;
  exp: number; // Expiration timestamp
  iat: number; // Issued at timestamp
}

/**
 * Decode JWT token (without verification - for development)
 * In production, you should verify the token signature with Azure AD public keys
 */
function decodeJwtToken(token: string): MsalTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    );

    return payload as MsalTokenPayload;
  } catch (error) {
    logError('Failed to decode JWT token', error);
    return null;
  }
}

/**
 * Verify MSAL token signature (simplified version)
 * In production, implement full JWT validation with Azure AD public keys
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/access-tokens#validating-tokens
 */
async function verifyMsalToken(token: string): Promise<MsalTokenPayload | null> {
  // TODO: Implement proper token validation with Azure AD public keys
  // For now, we'll just decode the token
  // In production, use a library like 'jsonwebtoken' or 'jose' to verify signatures

  const payload = decodeJwtToken(token);

  if (!payload) {
    return null;
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    logWarn('MSAL token expired', { exp: payload.exp, now });
    return null;
  }

  return payload;
}

/**
 * Get MSAL token from request Authorization header
 */
export function getMsalTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return null;
  }

  // Expected format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Authenticate request with MSAL token
 * Returns session or creates a new one if valid token is provided
 */
export async function authenticateWithMsal(
  request: NextRequest
): Promise<SessionModel | null> {
  const token = getMsalTokenFromRequest(request);

  if (!token) {
    return null;
  }

  try {
    // Verify and decode token
    const payload = await verifyMsalToken(token);

    if (!payload) {
      logWarn('Invalid MSAL token');
      return null;
    }

    // Check if session already exists
    const sessionId = request.cookies.get('session_id')?.value;
    if (sessionId) {
      const existingSession = await getSession(sessionId);
      if (existingSession && existingSession.userId === payload.oid) {
        // Session exists and matches the token user
        return existingSession;
      }
    }

    // Create new session
    const session = await createSession(payload.oid, {
      userAgent: request.headers.get('user-agent') || undefined,
      ipAddress: request.ip || undefined,
      email: payload.preferred_username,
      name: payload.name,
    });

    return session;
  } catch (error) {
    logError('MSAL authentication error', error);
    return null;
  }
}

/**
 * Require MSAL authentication
 * Returns session or throws error
 */
export async function requireMsalAuth(
  request: NextRequest
): Promise<SessionModel> {
  const session = await authenticateWithMsal(request);

  if (!session) {
    throw new AuthError('Unauthorized - Valid MSAL token required');
  }

  return session;
}

/**
 * Middleware wrapper for MSAL authentication
 */
export function withMsalAuth(
  handler: (
    request: NextRequest,
    session: SessionModel,
    context?: unknown
  ) => Promise<Response>
): (request: NextRequest, context?: unknown) => Promise<Response> {
  return async (request: NextRequest, context?: unknown) => {
    try {
      const session = await requireMsalAuth(request);
      return handler(request, session, context);
    } catch (error) {
      if (error instanceof AuthError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              message: error.message,
              code: 'UNAUTHORIZED',
            },
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      throw error;
    }
  };
}
