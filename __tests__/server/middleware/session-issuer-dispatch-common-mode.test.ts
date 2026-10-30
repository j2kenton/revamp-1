/**
 * Covers the 'common'-mode branch of the issuer dispatcher, which
 * session-issuer-dispatch.test.ts cannot exercise: `TENANT_ID` is resolved
 * once at module load, and jest.setup.ts pins
 * `NEXT_PUBLIC_AZURE_AD_TENANT_ID` to 'test-tenant' for every other test in
 * the suite. This file unsets it and re-imports the middleware modules
 * fresh (via `jest.resetModules()` + `jest.isolateModules()`) so
 * `isMsalIssuer`/`validateMsalToken` resolve `TENANT_ID === 'common'`,
 * matching the deliberately preserved any-Entra-tenant acceptance policy
 * documented in docs/authentication.md and the README.
 */
import type { NextRequest } from 'next/server';

const ORIGINAL_ENV = { ...process.env };

function makeToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('getSessionFromRequest issuer dispatch (common-mode tenancy policy)', () => {
  const originalTenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID;
  const originalAzureTenantId = process.env.AZURE_AD_TENANT_ID;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID;
    delete process.env.AZURE_AD_TENANT_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    if (originalTenantId !== undefined) {
      process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID = originalTenantId;
    }
    if (originalAzureTenantId !== undefined) {
      process.env.AZURE_AD_TENANT_ID = originalAzureTenantId;
    }
  });

  it('routes an arbitrary Entra-shaped issuer to the unchanged Microsoft validator', async () => {
    let session: Awaited<ReturnType<typeof import('@/server/middleware/session').getSessionFromRequest>> = null;

    await jest.isolateModulesAsync(async () => {
      jest.doMock('next/headers', () => ({
        cookies: jest.fn().mockResolvedValue({
          set: jest.fn(),
          delete: jest.fn(),
          get: jest.fn(),
        }),
      }));
      jest.doMock('@/lib/redis/session', () => ({
        getSession: jest.fn(),
        refreshSession: jest.fn(),
      }));
      jest.doMock('@/server/utils/test-auth', () => ({
        shouldBypassAuth: jest.fn(() => false),
        isTestAuthRequest: jest.fn(() => false),
      }));

      const msalAuthActual = jest.requireActual('@/server/middleware/msal-auth');
      jest.doMock('@/server/middleware/msal-auth', () => ({
        ...msalAuthActual,
        validateMsalToken: jest.fn().mockResolvedValue({
          oid: 'ms-oid-arbitrary',
          preferred_username: 'user@arbitrary-tenant.example',
          name: 'Arbitrary Tenant User',
          exp: 9999999999,
          iat: 1000000000,
          iss: 'https://login.microsoftonline.com/arbitrary-tenant-guid/v2.0',
          aud: 'test-client-id',
          tid: 'arbitrary-tenant-guid',
        }),
      }));

      const googleAuthActual = jest.requireActual('@/server/middleware/google-auth');
      jest.doMock('@/server/middleware/google-auth', () => ({
        ...googleAuthActual,
        validateGoogleToken: jest.fn(),
      }));

      const { getSessionFromRequest } = await import('@/server/middleware/session');
      const { validateMsalToken } = await import('@/server/middleware/msal-auth');
      const { validateGoogleToken } = await import('@/server/middleware/google-auth');
      const { NextRequest: IsolatedNextRequest } = await import('next/server');

      const token = makeToken({
        iss: 'https://login.microsoftonline.com/arbitrary-tenant-guid/v2.0',
        oid: 'ms-oid-arbitrary',
      });
      const request = new IsolatedNextRequest('http://localhost/api/chat', {
        headers: { authorization: `Bearer ${token}` },
      }) as unknown as NextRequest;

      session = await getSessionFromRequest(request);

      expect(validateMsalToken).toHaveBeenCalledWith(token);
      expect(validateGoogleToken).not.toHaveBeenCalled();
    });

    expect(session!.userId).toBe('ms-oid-arbitrary');
  });

  it('still rejects a non-Entra, non-Google issuer before any validator runs', async () => {
    let session: Awaited<ReturnType<typeof import('@/server/middleware/session').getSessionFromRequest>> = null;

    await jest.isolateModulesAsync(async () => {
      jest.doMock('next/headers', () => ({
        cookies: jest.fn().mockResolvedValue({
          set: jest.fn(),
          delete: jest.fn(),
          get: jest.fn(),
        }),
      }));
      jest.doMock('@/lib/redis/session', () => ({
        getSession: jest.fn(),
        refreshSession: jest.fn(),
      }));
      jest.doMock('@/server/utils/test-auth', () => ({
        shouldBypassAuth: jest.fn(() => false),
        isTestAuthRequest: jest.fn(() => false),
      }));

      const msalAuthActual = jest.requireActual('@/server/middleware/msal-auth');
      jest.doMock('@/server/middleware/msal-auth', () => ({
        ...msalAuthActual,
        validateMsalToken: jest.fn(),
      }));

      const googleAuthActual = jest.requireActual('@/server/middleware/google-auth');
      jest.doMock('@/server/middleware/google-auth', () => ({
        ...googleAuthActual,
        validateGoogleToken: jest.fn(),
      }));

      const { getSessionFromRequest } = await import('@/server/middleware/session');
      const { validateMsalToken } = await import('@/server/middleware/msal-auth');
      const { validateGoogleToken } = await import('@/server/middleware/google-auth');
      const { NextRequest: IsolatedNextRequest } = await import('next/server');

      const token = makeToken({ iss: 'https://evil.example.com' });
      const request = new IsolatedNextRequest('http://localhost/api/chat', {
        headers: { authorization: `Bearer ${token}` },
      }) as unknown as NextRequest;

      session = await getSessionFromRequest(request);

      expect(validateMsalToken).not.toHaveBeenCalled();
      expect(validateGoogleToken).not.toHaveBeenCalled();
    });

    expect(session).toBeNull();
  });
});
