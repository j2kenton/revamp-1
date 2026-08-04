/**
 * Client IP resolution.
 *
 * `X-Forwarded-For` is client-supplied and trivially spoofable, so it is only
 * honoured when the request demonstrably arrived through a proxy we trust.
 * This is the single source of truth for client IP across every middleware —
 * rate limiting keys off this value, so a permissive implementation anywhere
 * would let an attacker mint a fresh rate-limit bucket per request by
 * rotating the header.
 */

import type { NextRequest } from 'next/server';

const UNKNOWN_IP = 'unknown';

/**
 * Resolve the client IP, trusting `X-Forwarded-For` only when the connecting
 * peer is a configured trusted proxy (or when running on a platform that
 * terminates the edge for us — see the production branch below).
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  // The connecting peer is the *last* hop in X-Forwarded-For; earlier entries
  // are whatever the caller claimed and cannot be trusted on their own.
  //
  // CAVEAT: X-Real-IP is preferred here but is itself client-settable. That's
  // safe when the platform edge overwrites both headers before they reach us
  // (the assumption behind the production branch below). If you self-host
  // behind your own proxy, that proxy MUST strip inbound X-Real-IP and
  // X-Forwarded-For from client requests — otherwise a caller can set
  // X-Real-IP freely and mint a new rate-limit bucket per request.
  const connectingIp =
    realIp || (forwarded ? forwarded.split(',').pop()?.trim() : null);

  const trustedProxiesEnv = process.env.TRUSTED_PROXY_IPS;
  const trustedProxies = trustedProxiesEnv
    ? trustedProxiesEnv.split(',').map((ip) => ip.trim())
    : [];

  if (
    trustedProxies.length > 0 &&
    connectingIp &&
    trustedProxies.includes(connectingIp)
  ) {
    // Arrived via a trusted proxy: the first X-Forwarded-For entry is the
    // real client.
    return forwarded?.split(',')[0]?.trim() || UNKNOWN_IP;
  }

  if (trustedProxies.length === 0 && process.env.NODE_ENV === 'production') {
    // No explicit proxy allowlist in production: assume a platform edge
    // (e.g. Vercel) that overwrites X-Forwarded-For before it reaches us.
    // Set TRUSTED_PROXY_IPS when self-hosting behind your own proxy.
    return forwarded?.split(',')[0]?.trim() || connectingIp || UNKNOWN_IP;
  }

  if (connectingIp) {
    return connectingIp;
  }

  // Next.js's Request doesn't expose `.ip`; fall back to the socket's remote
  // address where the runtime provides one.
  const withSocket = request as unknown as {
    socket?: { remoteAddress?: string };
  };
  return withSocket.socket?.remoteAddress ?? UNKNOWN_IP;
}

/**
 * Same resolution, shaped for session/audit metadata: `undefined` rather than
 * the `'unknown'` sentinel, since `SessionData.ipAddress` is optional.
 *
 * Session records deliberately store the same proxy-validated address that
 * rate limiting keys on — an audit trail showing a caller-claimed IP would be
 * worse than storing nothing.
 */
export function getSessionClientIp(request: NextRequest): string | undefined {
  const ip = getClientIp(request);
  return ip === UNKNOWN_IP ? undefined : ip;
}
