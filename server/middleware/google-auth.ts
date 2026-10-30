/**
 * Google Authentication Middleware
 * Validates Google Identity Services ID tokens against Google's published
 * JWKS. Mirrors the validation approach in `server/middleware/msal-auth.ts`.
 */

import type { JWTPayload } from 'jose';
import { logError, logWarn } from '@/utils/logger';

export interface GoogleTokenPayload extends JWTPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  exp: number;
  iat: number;
  iss: string;
  aud: string;
}

const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

// Google documents both forms as valid issuer values.
export const GOOGLE_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
] as const;

export function isGoogleIssuer(issuer: unknown): boolean {
  return (
    typeof issuer === 'string' &&
    (GOOGLE_ISSUERS as readonly string[]).includes(issuer)
  );
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

type JoseModule = typeof import('jose');
type RemoteJwks = ReturnType<JoseModule['createRemoteJWKSet']>;

let joseModulePromise: Promise<JoseModule> | null = null;

async function loadJose(): Promise<JoseModule> {
  if (!joseModulePromise) {
    joseModulePromise = import('jose');
  }
  return joseModulePromise;
}

let googleJwks: RemoteJwks | null = null;

async function getGoogleJWKS(): Promise<RemoteJwks> {
  if (!googleJwks) {
    const { createRemoteJWKSet } = await loadJose();
    googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));
  }
  return googleJwks;
}

/**
 * Verify a Google ID token's signature, issuer, audience, and email
 * verification status.
 */
export async function validateGoogleToken(
  token: string,
): Promise<GoogleTokenPayload | null> {
  if (!GOOGLE_CLIENT_ID) {
    logWarn(
      'Received a Google token but NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured; rejecting.',
    );
    return null;
  }

  try {
    const { jwtVerify } = await loadJose();
    const JWKS = await getGoogleJWKS();

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: [...GOOGLE_ISSUERS],
      audience: GOOGLE_CLIENT_ID,
      algorithms: ['RS256'],
    });

    const googlePayload = payload as GoogleTokenPayload;

    if (!googlePayload.sub || !googlePayload.email) {
      logWarn('Google token missing required claims (sub/email)');
      return null;
    }

    if (googlePayload.email_verified !== true) {
      logWarn('Google token email is not verified', { sub: googlePayload.sub });
      return null;
    }

    return googlePayload;
  } catch (error) {
    if (error instanceof Error) {
      logError('Google token verification failed', {
        message: error.message,
        name: error.name,
      });
    } else {
      logError('Google token verification failed', error);
    }
    return null;
  }
}
