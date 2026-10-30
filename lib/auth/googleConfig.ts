/**
 * Google Identity Services (GIS) Configuration
 * Client-side configuration and credential-decoding helpers for "Sign in
 * with Google". Server-side verification happens separately in
 * server/middleware/google-auth.ts — decoding here is unverified and is
 * only used to drive client UI/state decisions.
 */

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export function isGoogleSignInConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

// openid + email + profile only — no additional Google scopes are requested.
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'] as const;

/**
 * `select_by` values that indicate an explicit user gesture (a real click,
 * as opposed to automatic/silent restoration). Anything not in this list,
 * including 'auto' and any undocumented future value, is treated as
 * automatic for the purposes of the identity-pin acceptance rule.
 */
export const GOOGLE_EXPLICIT_SELECT_BY = [
  'user',
  'user_1tap',
  'user_2tap',
  'btn',
  'btn_confirm',
  'btn_add_session',
  'btn_confirm_add_session',
] as const;

export type GoogleExplicitSelectBy = (typeof GOOGLE_EXPLICIT_SELECT_BY)[number];

export function isExplicitGoogleSelection(selectBy: string | undefined): boolean {
  if (!selectBy) {
    return false;
  }
  return (GOOGLE_EXPLICIT_SELECT_BY as readonly string[]).includes(selectBy);
}

export interface DecodedGoogleCredential {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
  exp: number;
  iat: number;
}

/**
 * Decode (without signature verification) the JWT ID token returned by GIS.
 * Safe for client-side use only to read display/identity hints; the server
 * independently verifies the signature before trusting any claim.
 */
export function decodeGoogleCredential(
  credential: string,
): DecodedGoogleCredential | null {
  try {
    const parts = credential.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(
      typeof window === 'undefined'
        ? Buffer.from(parts[1], 'base64url').toString('utf-8')
        : atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as Record<string, unknown>;

    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    const exp = typeof payload.exp === 'number' ? payload.exp : 0;

    if (!sub || !email || !exp) {
      return null;
    }

    const name =
      typeof payload.name === 'string' && payload.name
        ? payload.name
        : email.split('@')[0];

    return {
      sub,
      email,
      emailVerified: payload.email_verified === true,
      name,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      exp,
      iat: typeof payload.iat === 'number' ? payload.iat : 0,
    };
  } catch {
    return null;
  }
}
