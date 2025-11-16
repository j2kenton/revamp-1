/**
 * MSAL Authentication Middleware
 * Validates MSAL tokens and creates/updates sessions
 */

import type { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { AuthError } from '@/utils/error-handler';
import { logError, logWarn } from '@/utils/logger';
import { createSession, getSession } from '@/lib/redis/session';
import type { SessionModel } from '@/types/models';

export interface MsalTokenPayload extends JWTPayload {
  oid: string; // Object ID (user ID)
  preferred_username: string; // Email
  name: string;
  exp: number; // Expiration timestamp
  iat: number; // Issued at timestamp
  iss: string; // Issuer
  aud: string; // Audience
  tid: string; // Tenant ID
}

// Azure AD tenant ID and client ID from environment
// NOTE: For multi-tenant applications, TENANT_ID should be set to a specific tenant ID
// rather than 'common'. The 'common' endpoint cannot be used for JWKS validation.
// If you need to support multiple tenants, the token's 'tid' claim should be used
// to construct the JWKS URI dynamically.
const TENANT_ID = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID || 'common';
const CLIENT_ID = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID || '';

// Validate configuration at module load time
if (TENANT_ID === 'common') {
  logWarn(
    'MSAL configuration warning: TENANT_ID is set to "common". ' +
    'This is not valid for JWKS validation in multi-tenant applications. ' +
    'Please set NEXT_PUBLIC_AZURE_AD_TENANT_ID to your specific tenant ID. ' +
    'See: https://docs.microsoft.com/en-us/azure/active-directory/develop/howto-convert-app-to-be-multi-tenant'
  );
}

// Cache for JWKS sets by tenant ID to improve performance
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Get or create a JWKS set for a specific tenant
 * This ensures proper token validation for multi-tenant scenarios
 */
function getJWKSForTenant(tenantId: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache.has(tenantId)) {
    const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
    jwksCache.set(tenantId, createRemoteJWKSet(new URL(jwksUri)));
  }
  return jwksCache.get(tenantId)!;
}

/**
 * Verify MSAL token signature with Azure AD public keys
 * Implements full JWT validation per Microsoft's security requirements
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/access-tokens#validating-tokens
 */
export async function validateMsalToken(
  token: string,
): Promise<MsalTokenPayload | null> {
  try {
    // First, decode without verification to extract the tenant ID from claims
    // This is safe because we'll verify the signature in the next step
    const parts = token.split('.');
    if (parts.length !== 3) {
      logWarn('Invalid JWT format');
      return null;
    }

    // Decode payload to get tenant ID
    const payloadDecoded = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    );
    
    // Extract tenant ID from token claims
    const tokenTenantId = payloadDecoded.tid;
    
    if (!tokenTenantId || typeof tokenTenantId !== 'string') {
      logWarn('MSAL token missing tenant ID (tid) claim');
      return null;
    }

    // Get JWKS for the specific tenant from the token
    const JWKS = getJWKSForTenant(tokenTenantId);

    // Verify the token signature and validate claims
    const { payload } = await jwtVerify(token, JWKS, {
      // Validate issuer with the tenant ID from the token
      issuer: `https://login.microsoftonline.com/${tokenTenantId}/v2.0`,
      // Validate audience (should be the client ID)
      audience: CLIENT_ID,
      // Additional security checks
      algorithms: ['RS256'], // Azure AD uses RS256
    });

    // Type assertion after validation
    const msalPayload = payload as MsalTokenPayload;

    // Validate required claims are present
    if (!msalPayload.oid || !msalPayload.preferred_username) {
      logWarn('MSAL token missing required claims', { payload: msalPayload });
      return null;
    }

    // If a specific tenant is configured, validate the token is from that tenant
    if (TENANT_ID !== 'common' && msalPayload.tid !== TENANT_ID) {
      logWarn('MSAL token tenant mismatch', {
        expected: TENANT_ID,
        actual: msalPayload.tid,
      });
      return null;
    }

    return msalPayload;
  } catch (error) {
    // Log specific verification errors
    if (error instanceof Error) {
      logError('MSAL token verification failed', {
        message: error.message,
        name: error.name,
      });
    } else {
      logError('MSAL token verification failed', error);
    }
    return null;
  }
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
    const payload = await validateMsalToken(token);

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
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
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
