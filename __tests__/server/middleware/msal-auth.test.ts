import { withMsalAuth } from '@/server/middleware/msal-auth';
import { NextRequest } from 'next/server';

describe('MSAL Auth Middleware', () => {
  it('allows requests with valid JWT', async () => {
    const mockHandler = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

    const validToken = 'Bearer valid-jwt-token';
    const request = new NextRequest('http://localhost/api/test', {
      headers: { Authorization: validToken },
    });

    const wrappedHandler = withMsalAuth(mockHandler);
    const response = await wrappedHandler(request);

    expect(response.status).toBe(200);
    expect(mockHandler).toHaveBeenCalled();
  });

  it('rejects requests without authorization header', async () => {
    const mockHandler = jest.fn();
    const request = new NextRequest('http://localhost/api/test');

    const wrappedHandler = withMsalAuth(mockHandler);
    const response = await wrappedHandler(request);

    expect(response.status).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('rejects requests with invalid JWT format', async () => {
    const mockHandler = jest.fn();
    const request = new NextRequest('http://localhost/api/test', {
      headers: { Authorization: 'Bearer invalid' },
    });

    const wrappedHandler = withMsalAuth(mockHandler);
    const response = await wrappedHandler(request);

    expect(response.status).toBe(401);
  });

  it('validates JWT expiration', async () => {
    const mockHandler = jest.fn();
    const expiredToken = 'Bearer expired-jwt-token';
    const request = new NextRequest('http://localhost/api/test', {
      headers: { Authorization: expiredToken },
    });

    const wrappedHandler = withMsalAuth(mockHandler);
    const response = await wrappedHandler(request);

    expect(response.status).toBe(401);
  });
});
