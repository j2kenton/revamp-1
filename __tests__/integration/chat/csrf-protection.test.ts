import { NextRequest } from 'next/server';
import { withCsrfProtection, requireCsrfToken } from '@/server/middleware/csrf';

describe('CSRF protection', () => {
  const ok = jest.fn(async () => new Response(JSON.stringify({ ok: true })));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns valid flag for safe methods', async () => {
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
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
    });
    const handler = requireCsrfToken(ok);
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(ok).not.toHaveBeenCalled();
  });
});
