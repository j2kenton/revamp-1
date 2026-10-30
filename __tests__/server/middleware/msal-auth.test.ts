import { NextRequest } from 'next/server';
import {
  getMsalTokenFromRequest,
  isMsalIssuer,
  withMsalAuth,
} from '@/server/middleware/msal-auth';

describe('MSAL auth helpers', () => {
  describe('getMsalTokenFromRequest', () => {
    it('returns token when Authorization header uses Bearer scheme', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(getMsalTokenFromRequest(request)).toBe('test-token');
    });

    it('returns null when header missing or invalid', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          authorization: 'Basic abc123',
        },
      });

      expect(getMsalTokenFromRequest(request)).toBeNull();
      expect(getMsalTokenFromRequest(new NextRequest('http://localhost/api/test'))).toBeNull();
    });
  });

  describe('withMsalAuth', () => {
    it('returns 401 when authentication fails', async () => {
      const mockHandler = jest.fn();
      const wrappedHandler = withMsalAuth(
        async (request, session, context) => mockHandler(request, session, context),
      );

      const response = await wrappedHandler(new NextRequest('http://localhost/api/test'));

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('isMsalIssuer (configured-tenant mode, from jest.setup.ts default)', () => {
    it('accepts the exact configured tenant issuer', () => {
      expect(
        isMsalIssuer('https://login.microsoftonline.com/test-tenant/v2.0'),
      ).toBe(true);
    });

    it('rejects a different tenant issuer', () => {
      expect(
        isMsalIssuer('https://login.microsoftonline.com/other-tenant/v2.0'),
      ).toBe(false);
    });

    it('rejects non-Entra and malformed issuers', () => {
      expect(isMsalIssuer('https://accounts.google.com')).toBe(false);
      expect(isMsalIssuer('https://login.microsoftonline.com/v2.0')).toBe(false);
      expect(isMsalIssuer(undefined)).toBe(false);
    });
  });

  describe('isMsalIssuer (common tenant mode)', () => {
    it('accepts any single-tenant-shaped issuer when TENANT_ID is "common"', () => {
      const originalTenant = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID;
      process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID = 'common';

      let isMsalIssuerCommon!: (issuer: unknown) => boolean;
      jest.isolateModules(() => {
        isMsalIssuerCommon =
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('@/server/middleware/msal-auth').isMsalIssuer;
      });

      expect(
        isMsalIssuerCommon('https://login.microsoftonline.com/any-tenant-guid/v2.0'),
      ).toBe(true);
      expect(
        isMsalIssuerCommon('https://login.microsoftonline.com/another-one/v2.0'),
      ).toBe(true);
      expect(isMsalIssuerCommon('https://accounts.google.com')).toBe(false);

      process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID = originalTenant;
    });
  });
});
