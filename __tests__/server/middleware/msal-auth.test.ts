import { NextRequest } from 'next/server';
import {
  getMsalTokenFromRequest,
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
});
