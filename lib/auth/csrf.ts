/**
 * CSRF Token Utilities
 * Derive deterministic CSRF tokens from MSAL access tokens on the client.
 */

'use client';

/**
 * Convert ArrayBuffer digest to hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive a CSRF token from the MSAL access token.
 * We hash the token client-side to avoid sending the raw JWT twice.
 */
export async function deriveCsrfToken(accessToken: string | null): Promise<string | null> {
  if (!accessToken) {
    return null;
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(accessToken);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}
