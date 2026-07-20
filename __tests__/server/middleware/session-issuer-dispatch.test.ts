import { NextRequest } from 'next/server';

// server/middleware/session.ts imports `cookies` for the (unused-here)
// set/clear cookie helpers; stub it so importing the real module never
// depends on Next's request-scoped runtime inside Jest.
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

import { getSessionFromRequest } from '@/server/middleware/session';
import { validateMsalToken } from '@/server/middleware/msal-auth';
import { validateGoogleToken } from '@/server/middleware/google-auth';

const mockValidateMsalToken = validateMsalToken as jest.MockedFunction<
  typeof validateMsalToken
>;
const mockValidateGoogleToken = validateGoogleToken as jest.MockedFunction<
  typeof validateGoogleToken
>;

// TENANT_ID for the MSAL validator resolves from NEXT_PUBLIC_AZURE_AD_TENANT_ID,
// pinned to 'test-tenant' in jest.setup.ts.
const CONFIGURED_TENANT = 'test-tenant';

function makeToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

function requestWithBearer(token: string): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('getSessionFromRequest issuer dispatch (JWT fallback)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes a Google-issued token to the Google validator and normalizes the identity', async () => {
    const token = makeToken({
      iss: 'https://accounts.google.com',
      sub: 'google-sub-1',
    });
    mockValidateGoogleToken.mockResolvedValue({
      sub: 'google-sub-1',
      email: 'user@gmail.com',
      email_verified: true,
      name: 'Google User',
      iss: 'https://accounts.google.com',
      aud: 'test-google-client-id',
      exp: 9999999999,
      iat: 1000000000,
    });

    const session = await getSessionFromRequest(requestWithBearer(token));

    expect(mockValidateGoogleToken).toHaveBeenCalledWith(token);
    expect(mockValidateMsalToken).not.toHaveBeenCalled();
    expect(session?.userId).toBe('google:google-sub-1');
    expect(session?.data.email).toBe('user@gmail.com');
    expect(session?.id).toBe('jwt-fallback:google:google-sub-1');
  });

  it('falls back to the email local part when the Google name claim is empty', async () => {
    const token = makeToken({ iss: 'accounts.google.com', sub: 'sub-2' });
    mockValidateGoogleToken.mockResolvedValue({
      sub: 'sub-2',
      email: 'someone@example.com',
      email_verified: true,
      name: '',
      iss: 'accounts.google.com',
      aud: 'test-google-client-id',
      exp: 9999999999,
      iat: 1000000000,
    });

    const session = await getSessionFromRequest(requestWithBearer(token));
    expect(session?.data.name).toBe('someone');
  });

  it('returns null when the Google validator rejects the token', async () => {
    const token = makeToken({ iss: 'https://accounts.google.com' });
    mockValidateGoogleToken.mockResolvedValue(null);

    const session = await getSessionFromRequest(requestWithBearer(token));
    expect(session).toBeNull();
  });

  it('routes a matching-tenant MSAL-shaped token to the Microsoft validator', async () => {
    const token = makeToken({
      iss: `https://login.microsoftonline.com/${CONFIGURED_TENANT}/v2.0`,
      oid: 'ms-oid-1',
    });
    mockValidateMsalToken.mockResolvedValue({
      oid: 'ms-oid-1',
      preferred_username: 'user@contoso.com',
      name: 'MS User',
      exp: 9999999999,
      iat: 1000000000,
      iss: `https://login.microsoftonline.com/${CONFIGURED_TENANT}/v2.0`,
      aud: 'test-client-id',
      tid: CONFIGURED_TENANT,
    });

    const session = await getSessionFromRequest(requestWithBearer(token));

    expect(mockValidateMsalToken).toHaveBeenCalledWith(token);
    expect(mockValidateGoogleToken).not.toHaveBeenCalled();
    expect(session?.userId).toBe('ms-oid-1');
  });

  it('rejects a foreign-tenant issuer without invoking any validator', async () => {
    const token = makeToken({
      iss: 'https://login.microsoftonline.com/some-other-tenant/v2.0',
    });

    const session = await getSessionFromRequest(requestWithBearer(token));

    expect(session).toBeNull();
    expect(mockValidateMsalToken).not.toHaveBeenCalled();
    expect(mockValidateGoogleToken).not.toHaveBeenCalled();
  });

  it('rejects a token whose issuer matches neither provider, without invoking any validator', async () => {
    const token = makeToken({ iss: 'https://evil.example.com' });

    const session = await getSessionFromRequest(requestWithBearer(token));

    expect(session).toBeNull();
    expect(mockValidateMsalToken).not.toHaveBeenCalled();
    expect(mockValidateGoogleToken).not.toHaveBeenCalled();
  });

  it('rejects a malformed bearer token without invoking any validator', async () => {
    const session = await getSessionFromRequest(
      requestWithBearer('not-a-real-jwt'),
    );

    expect(session).toBeNull();
    expect(mockValidateMsalToken).not.toHaveBeenCalled();
    expect(mockValidateGoogleToken).not.toHaveBeenCalled();
  });

  it('returns null when there is no bearer token at all', async () => {
    const session = await getSessionFromRequest(
      new NextRequest('http://localhost/api/chat'),
    );
    expect(session).toBeNull();
  });
});
