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

const sessionModule = jest.requireMock('@/server/middleware/session');
const redisSession = jest.requireMock('@/lib/redis/session');

describe('CSRF protection', () => {
  const ok = jest.fn(async () => new Response(JSON.stringify({ ok: true })));

  beforeEach(() => {
    jest.clearAllMocks();
    sessionModule.requiresCsrfProtection.mockImplementation(
      (method: string) => method !== 'GET',
    );
    sessionModule.getSessionFromRequest.mockResolvedValue({ id: 'session-1' });
    sessionModule.getCsrfTokenFromRequest.mockReturnValue('valid');
    redisSession.validateCsrfToken.mockResolvedValue(true);
  });

  it('returns valid flag for safe methods', async () => {
    sessionModule.requiresCsrfProtection.mockReturnValue(false);
    const req = new NextRequest('http://localhost/api/chat', { method: 'GET' });
    const result = await withCsrfProtection(req);
    expect(result.valid).toBe(true);
  });

  it('allows valid token via wrapper', async () => {
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'valid' },
    });
    const handler = requireCsrfToken(ok);
    const res = await handler(req);
    expect([200, 204]).toContain(res.status);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('blocks missing token via wrapper', async () => {
    sessionModule.getCsrfTokenFromRequest.mockReturnValue(null);
    redisSession.validateCsrfToken.mockResolvedValue(false);
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
    });
    const handler = requireCsrfToken(ok);
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(ok).not.toHaveBeenCalled();
  });
});
