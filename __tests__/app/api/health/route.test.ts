import { NextRequest } from 'next/server';
import { GET } from '@/app/api/health/route';
import { getRedisClient } from '@/lib/redis/client';

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(),
}));

const mockRedis = {
  ping: jest.fn(),
};

(getRedisClient as jest.Mock).mockReturnValue(mockRedis);

describe('Health API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns healthy response when dependencies succeed', async () => {
    mockRedis.ping.mockResolvedValue('PONG');

    const request = new NextRequest('http://localhost/api/health');
    const response = await GET(request);
    const payload = JSON.parse(await response.text());

    expect(response.status).toBe(200);
    expect(payload.status).toBe('healthy');
    expect(payload.checks.redis.status).toBe('healthy');
  });

  it('marked unhealthy when Redis ping fails', async () => {
    mockRedis.ping.mockRejectedValue(new Error('Redis down'));

    const request = new NextRequest('http://localhost/api/health');
    const response = await GET(request);

    expect(response.status).toBe(503);
    const payload = JSON.parse(await response.text());
    expect(payload.status).toBe('unhealthy');
  });
});
