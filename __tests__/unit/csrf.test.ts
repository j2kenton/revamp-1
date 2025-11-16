import { NextRequest } from 'next/server';
import { withCsrfProtection, requireCsrfToken } from '@/server/middleware/csrf';

jest.mock('@/server/middleware/session', () => ({
  getSessionFromRequest: jest.fn(),
  getCsrfTokenFromRequest: jest.fn(),
  requiresCsrfProtection: jest.fn(),
  JWT_FALLBACK_PREFIX: 'jwt-fallback',
}));

jest.mock('@/lib/redis/session', () => ({
  validateCsrfToken: jest.fn(),
}));

jest.mock('@/server/middleware/msal-auth', () => ({
  getMsalTokenFromRequest: jest.fn(),
}));

const sessionModule = jest.requireMock('@/server/middleware/session');
const redisSession = jest.requireMock('@/lib/redis/session');
const msalModule = jest.requireMock('@/server/middleware/msal-auth');

describe('withCsrfProtection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionModule.requiresCsrfProtection.mockReturnValue(true);
    sessionModule.getSessionFromRequest.mockResolvedValue({
      id: 'session-1',
    });
    sessionModule.getCsrfTokenFromRequest.mockReturnValue('token');
    redisSession.validateCsrfToken.mockResolvedValue(true);
  });

  it('skips validation for safe methods', async () => {
    sessionModule.requiresCsrfProtection.mockReturnValue(false);
    const req = new NextRequest('http://localhost', { method: 'GET' });
    const result = await withCsrfProtection(req);
    expect(result.valid).toBe(true);
  });

  it('validates when CSRF token matches session', async () => {
    const req = new NextRequest('http://localhost', { method: 'POST' });
    const result = await withCsrfProtection(req);
    expect(result.valid).toBe(true);
    expect(redisSession.validateCsrfToken).toHaveBeenCalled();
  });

  it('rejects missing token', async () => {
    sessionModule.getCsrfTokenFromRequest.mockReturnValue(null);
    const req = new NextRequest('http://localhost', { method: 'POST' });
    const result = await withCsrfProtection(req);
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(401);
  });

  it('falls back to MSAL token when session is JWT', async () => {
    sessionModule.getSessionFromRequest.mockResolvedValue({
      id: 'jwt-fallback:123',
    });
    msalModule.getMsalTokenFromRequest.mockReturnValue('msal-token');
    sessionModule.getCsrfTokenFromRequest.mockReturnValue(
      'd5579c46dfcc7d0d7f20a6e1c4a8d32de9fa59c7805a3ec47e1d6f99a64f2b48', // sha256('msal-token')
    );
    const req = new NextRequest('http://localhost', { method: 'POST' });
    const result = await withCsrfProtection(req);
    expect(result.valid).toBe(true);
  });
});

describe('requireCsrfToken wrapper', () => {
  it('short-circuits when protection fails', async () => {
    sessionModule.requiresCsrfProtection.mockReturnValue(true);
    sessionModule.getSessionFromRequest.mockResolvedValue(null);
    const handler = requireCsrfToken(
      async () => new Response(null, { status: 204 }),
    );
    const req = new NextRequest('http://localhost', { method: 'POST' });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('invokes handler when valid', async () => {
    sessionModule.requiresCsrfProtection.mockReturnValue(true);
    sessionModule.getSessionFromRequest.mockResolvedValue({ id: 'session-1' });
    sessionModule.getCsrfTokenFromRequest.mockReturnValue('token');
    redisSession.validateCsrfToken.mockResolvedValue(true);
    const handler = requireCsrfToken(
      async () => new Response(null, { status: 204 }),
    );
    const req = new NextRequest('http://localhost', { method: 'POST' });
    const res = await handler(req);
    expect(res.status).toBe(204);
  });
});
