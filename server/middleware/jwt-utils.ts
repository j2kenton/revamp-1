/**
 * Shared JWT helpers used to decide which provider-specific validator a
 * bearer token should be routed to, before any signature verification runs.
 */

const JWT_PARTS_COUNT = 3;
const JWT_PAYLOAD_INDEX = 1;

/**
 * Decode a JWT payload WITHOUT verifying its signature. Only safe for
 * reading routing hints (e.g. `iss`) — callers must independently verify
 * the signature before trusting any other claim.
 */
export function decodeUnverifiedJwtPayload(
  token: string,
): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== JWT_PARTS_COUNT) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(parts[JWT_PAYLOAD_INDEX], 'base64url').toString('utf-8'),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}
