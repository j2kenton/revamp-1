/**
 * Google ID token rotation: CSRF + ownership regression test.
 *
 * Google sign-in has no server-persisted Redis session (see
 * `server/middleware/session.ts`'s `getSessionFromJwtFallback`) — every
 * state-changing request is authenticated statelessly from the current
 * bearer Google ID token, and the CSRF token is a SHA-256 hash of that same
 * token (derived client-side by `lib/auth/csrf.ts#deriveCsrfToken`, checked
 * server-side by `server/middleware/csrf.ts#withCsrfProtection`). Because
 * `GoogleAuthProvider`'s renewal timer periodically swaps in a fresh ID
 * token, a naive implementation could bind the CSRF check to a token that's
 * no longer current and start rejecting legitimate requests after rotation.
 *
 * This test exercises the REAL `withCsrfProtection` -> `getSessionFromRequest`
 * -> `getSessionFromJwtFallback` -> `validateGoogleToken` chain (only the
 * network-calling JWKS verification in `validateGoogleToken` is mocked) for
 * two consecutive requests, each carrying a different, valid, renewed Google
 * ID token for the SAME account, and asserts both pass and resolve to the
 * same owning identity.
 */
import { NextRequest } from 'next/server';
import { withCsrfProtection } from '@/server/middleware/csrf';
import { getSessionFromRequest } from '@/server/middleware/session';
import { deriveCsrfToken } from '@/lib/auth/csrf';

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    set: jest.fn(),
    delete: jest.fn(),
    get: jest.fn(),
  }),
}));

jest.mock('@/lib/redis/session', () => ({
  getSession: jest.fn(),
  refreshSession: jest.fn(),
  validateCsrfToken: jest.fn(),
}));

jest.mock('@/server/utils/test-auth', () => ({
  shouldBypassAuth: jest.fn(() => false),
  isTestAuthRequest: jest.fn(() => false),
}));

jest.mock('@/server/middleware/msal-auth', () => {
  const actual = jest.requireActual('@/server/middleware/msal-auth');
  return {
    ...actual,
    validateMsalToken: jest.fn(),
  };
});

jest.mock('@/server/middleware/google-auth', () => {
  const actual = jest.requireActual('@/server/middleware/google-auth');
  return {
    ...actual,
    validateGoogleToken: jest.fn(),
  };
});

import { validateGoogleToken } from '@/server/middleware/google-auth';

const mockValidateGoogleToken = validateGoogleToken as jest.MockedFunction<
  typeof validateGoogleToken
>;

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function makeToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  // The signature segment only needs to be distinct per token so two
  // "renewed" tokens for the same sub hash to different CSRF values.
  return `${header}.${body}.signature-${payload.iat}`;
}

async function requestWithBearerAndCsrf(token: string): Promise<NextRequest> {
  const csrfToken = await deriveCsrfToken(token);
  return new NextRequest('http://localhost/api/chat/stream', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-csrf-token': csrfToken ?? '',
    },
  });
}

describe('Google token rotation: CSRF + ownership across consecutive requests', () => {
  beforeAll(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: ORIGINAL_NODE_ENV,
      configurable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts two consecutive requests with different renewed Google ID tokens for the same account', async () => {
    const sub = 'google-sub-rotation-1';
    const tokenOne = makeToken({
      iss: 'https://accounts.google.com',
      sub,
      iat: 1_000_000_000,
      exp: 1_000_003_600,
    });
    const tokenTwo = makeToken({
      iss: 'https://accounts.google.com',
      sub,
      iat: 1_000_003_500, // renewed shortly before the first token's expiry
      exp: 1_000_007_100,
    });

    expect(tokenOne).not.toBe(tokenTwo);

    mockValidateGoogleToken.mockImplementation(async (token: string) => {
      if (token === tokenOne) {
        return {
          sub,
          email: 'user@gmail.com',
          email_verified: true,
          name: 'Google User',
          iss: 'https://accounts.google.com',
          aud: 'test-google-client-id',
          exp: 1_000_003_600,
          iat: 1_000_000_000,
        };
      }
      if (token === tokenTwo) {
        return {
          sub,
          email: 'user@gmail.com',
          email_verified: true,
          name: 'Google User',
          iss: 'https://accounts.google.com',
          aud: 'test-google-client-id',
          exp: 1_000_007_100,
          iat: 1_000_003_500,
        };
      }
      return null;
    });

    // --- Request 1: original token ---
    const reqOne = await requestWithBearerAndCsrf(tokenOne);
    const csrfResultOne = await withCsrfProtection(reqOne);
    expect(csrfResultOne.valid).toBe(true);
    expect(csrfResultOne.error).toBeUndefined();

    const sessionOne = await getSessionFromRequest(
      await requestWithBearerAndCsrf(tokenOne),
    );
    expect(sessionOne?.userId).toBe(`google:${sub}`);

    // --- Request 2: renewed token (rotation) ---
    const reqTwo = await requestWithBearerAndCsrf(tokenTwo);
    const csrfResultTwo = await withCsrfProtection(reqTwo);
    expect(csrfResultTwo.valid).toBe(true);
    expect(csrfResultTwo.error).toBeUndefined();

    const sessionTwo = await getSessionFromRequest(
      await requestWithBearerAndCsrf(tokenTwo),
    );
    expect(sessionTwo?.userId).toBe(`google:${sub}`);

    // Ownership is stable across rotation: both requests resolve to the
    // same identity, and neither was rejected because of the token swap.
    expect(sessionOne?.userId).toBe(sessionTwo?.userId);

    // Sanity: the two requests' CSRF tokens actually differ (each is a hash
    // of its own bearer token), proving this isn't accidentally passing
    // because both requests reused one static token/hash pair.
    const csrfOne = reqOne.headers.get('x-csrf-token');
    const csrfTwo = reqTwo.headers.get('x-csrf-token');
    expect(csrfOne).not.toBe(csrfTwo);
  });

  it('rejects a request whose CSRF header was derived from a different (stale) rotated token', async () => {
    const sub = 'google-sub-rotation-2';
    const staleToken = makeToken({
      iss: 'https://accounts.google.com',
      sub,
      iat: 2_000_000_000,
    });
    const currentToken = makeToken({
      iss: 'https://accounts.google.com',
      sub,
      iat: 2_000_003_500,
    });

    mockValidateGoogleToken.mockImplementation(async (token: string) => ({
      sub,
      email: 'user@gmail.com',
      email_verified: true,
      name: 'Google User',
      iss: 'https://accounts.google.com',
      aud: 'test-google-client-id',
      exp: 9_999_999_999,
      iat: token === staleToken ? 2_000_000_000 : 2_000_003_500,
    }));

    const staleCsrf = await deriveCsrfToken(staleToken);
    const req = new NextRequest('http://localhost/api/chat/stream', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${currentToken}`,
        'x-csrf-token': staleCsrf ?? '',
      },
    });

    const result = await withCsrfProtection(req);
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(401);
  });
});
