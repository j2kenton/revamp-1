import {
  ok,
  badRequest,
  tooManyRequests,
  serverError,
} from '@/server/api-response';

describe('server/api-response helpers', () => {
  it('wraps data in ok response', () => {
    const res = ok({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/i);
  });

  it('creates badRequest errors', () => {
    const res = badRequest('Invalid', { field: 'email' });
    expect(res.status).toBe(400);
  });

  it('sets retry-after for rate limits', () => {
    const res = tooManyRequests('Slow down', { retryAfter: 30 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
  });

  it('returns serverError', () => {
    const res = serverError('Boom');
    expect(res.status).toBe(500);
  });
});
