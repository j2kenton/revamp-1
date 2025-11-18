import { NextRequest } from 'next/server';
import * as msalAuth from '@/server/middleware/msal-auth';
import { AuthError } from '@/utils/error-handler';
import type { SessionModel } from '@/types/models';

describe('MSAL Auth Middleware', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows downstream handler when session is present', async () => {
    const session = {
      id: 'session-123',
      userId: 'user-abc',
    } as SessionModel;

    const authSpy = jest
      .spyOn(msalAuth, 'requireMsalAuth')
      .mockResolvedValue(session);

    const mockHandler = jest.fn(async (_request: NextRequest, receivedSession: SessionModel) => {
      expect(receivedSession).toBe(session);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const wrappedHandler = msalAuth.withMsalAuth(mockHandler);
    const response = await wrappedHandler(new NextRequest('http://localhost/api/test'));

    expect(response.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledTimes(1);
    authSpy.mockRestore();
  });

  it('returns 401 when authentication fails', async () => {
    const authSpy = jest
      .spyOn(msalAuth, 'requireMsalAuth')
      .mockRejectedValue(new AuthError('Unauthorized - Valid MSAL token required'));

    const mockHandler = jest.fn();
    const wrappedHandler = msalAuth.withMsalAuth(mockHandler);
    const response = await wrappedHandler(new NextRequest('http://localhost/api/test'));

    expect(response.status).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
    authSpy.mockRestore();
  });
});
