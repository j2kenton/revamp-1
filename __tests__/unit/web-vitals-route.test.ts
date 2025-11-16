/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/analytics/web-vitals/route';
import * as redisClient from '@/lib/redis/client';
import * as rateLimiter from '@/lib/rate-limiter';
import type { Redis } from 'ioredis';

// Mock dependencies
jest.mock('@/lib/redis/client');
jest.mock('@/lib/rate-limiter');
jest.mock('@/utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

describe('POST /api/analytics/web-vitals', () => {
  const mockRedis = {} as Redis;
  let originalEnv: NodeJS.ProcessEnv;

  // Helper to set environment variables for tests
  const setEnv = (key: string, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;

    // Mock Redis client
    (redisClient.getRedisClient as jest.Mock).mockReturnValue(mockRedis);

    // Mock rate limiter to allow by default
    (rateLimiter.checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: new Date(Date.now() + 60000),
    });

    // Set NODE_ENV to development for tests
    process.env = { ...originalEnv, NODE_ENV: 'development' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createRequest = (
    body: unknown,
    headers?: Record<string, string>
  ): NextRequest => {
    const url = 'http://localhost:3000/api/analytics/web-vitals';
    return new NextRequest(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  };

  describe('Valid metric submission', () => {
    it('accepts valid LCP metric', async () => {
      const metric = {
        id: 'v1-123',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('accepts valid CLS metric', async () => {
      const metric = {
        id: 'v1-456',
        name: 'CLS',
        value: 0.05,
        rating: 'good' as const,
        delta: 0.05,
        navigationType: 'navigate',
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('accepts metric with attribution data', async () => {
      const metric = {
        id: 'v1-789',
        name: 'INP',
        value: 150,
        rating: 'good' as const,
        delta: 150,
        navigationType: 'navigate',
        attribution: {
          element: 'button#submit',
          loadState: 'dom-interactive',
        },
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Metric name validation', () => {
    it('rejects invalid metric name', async () => {
      const metric = {
        id: 'v1-999',
        name: 'INVALID_METRIC',
        value: 100,
        rating: 'good' as const,
        delta: 100,
        navigationType: 'navigate',
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid metric name');
    });

    it('rejects empty metric name', async () => {
      const metric = {
        id: 'v1-999',
        name: '',
        value: 100,
        rating: 'good' as const,
        delta: 100,
        navigationType: 'navigate',
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('accepts all valid Core Web Vitals metrics', async () => {
      const validMetrics = ['CLS', 'FID', 'LCP', 'FCP', 'INP', 'TTFB'];

      for (const metricName of validMetrics) {
        const metric = {
          id: `v1-${metricName}`,
          name: metricName,
          value: 100,
          rating: 'good' as const,
          delta: 100,
          navigationType: 'navigate',
        };

        const request = createRequest(metric);
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
      }
    });
  });

  describe('Metric value validation', () => {
    it('rejects non-numeric value', async () => {
      const metric = {
        id: 'v1-999',
        name: 'LCP',
        value: 'not a number' as unknown as number,
        rating: 'good' as const,
        delta: 100,
        navigationType: 'navigate',
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('value must be a number');
    });

    it('accepts zero as valid value', async () => {
      const metric = {
        id: 'v1-000',
        name: 'CLS',
        value: 0,
        rating: 'good' as const,
        delta: 0,
        navigationType: 'navigate',
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Attribution size validation', () => {
    it('rejects attribution data larger than 10KB', async () => {
      // Create large attribution object (>10KB)
      const largeAttribution: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        largeAttribution[`key${i}`] = 'x'.repeat(50);
      }

      const metric = {
        id: 'v1-large',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
        attribution: largeAttribution,
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(413);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Attribution data too large');
    });

    it('accepts attribution data under 10KB', async () => {
      const metric = {
        id: 'v1-small',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
        attribution: {
          element: 'img#hero',
          url: '/images/hero.jpg',
          loadState: 'dom-interactive',
        },
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Rate limiting', () => {
    it('blocks request when rate limit exceeded', async () => {
      (rateLimiter.checkRateLimit as jest.Mock).mockResolvedValue({
        allowed: false,
        limit: 10,
        remaining: 0,
        resetAt: new Date(Date.now() + 60000),
      });

      const metric = {
        id: 'v1-rate',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Rate limit exceeded');
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('allows request when under rate limit', async () => {
      (rateLimiter.checkRateLimit as jest.Mock).mockResolvedValue({
        allowed: true,
        limit: 10,
        remaining: 5,
        resetAt: new Date(Date.now() + 60000),
      });

      const metric = {
        id: 'v1-ok',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('fails open if rate limiter errors', async () => {
      (rateLimiter.checkRateLimit as jest.Mock).mockRejectedValue(
        new Error('Redis unavailable')
      );

      const metric = {
        id: 'v1-failopen',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('uses IP address from x-forwarded-for header', async () => {
      const metric = {
        id: 'v1-ip',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
      };

      const request = createRequest(metric, {
        'x-forwarded-for': '192.168.1.1, 10.0.0.1',
      });
      await POST(request);

      expect(rateLimiter.checkRateLimit).toHaveBeenCalledWith(
        mockRedis,
        'webvitals:192.168.1.1',
        expect.any(Object)
      );
    });
  });

  describe('Origin validation', () => {
    it('allows requests in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      setEnv('NODE_ENV', 'development');

      const metric = {
        id: 'v1-dev',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
      };

      const request = createRequest(metric);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      setEnv('NODE_ENV', originalEnv);
    });

    it('validates origin in production mode with ALLOWED_ORIGINS', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalOrigins = process.env.ALLOWED_ORIGINS;

      setEnv('NODE_ENV', 'production');
      setEnv('ALLOWED_ORIGINS', 'https://example.com,https://app.example.com');

      const metric = {
        id: 'v1-prod',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
      };

      const request = createRequest(metric, {
        origin: 'https://example.com',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      setEnv('NODE_ENV', originalEnv);
      setEnv('ALLOWED_ORIGINS', originalOrigins);
    });

    it('rejects unauthorized origin in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalOrigins = process.env.ALLOWED_ORIGINS;

      setEnv('NODE_ENV', 'production');
      setEnv('ALLOWED_ORIGINS', 'https://example.com');

      const metric = {
        id: 'v1-unauth',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
      };

      const request = createRequest(metric, {
        origin: 'https://malicious.com',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized origin');

      setEnv('NODE_ENV', originalEnv);
      setEnv('ALLOWED_ORIGINS', originalOrigins);
    });

    it('validates referer when origin is not present', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalOrigins = process.env.ALLOWED_ORIGINS;

      setEnv('NODE_ENV', 'production');
      setEnv('ALLOWED_ORIGINS', 'https://example.com');

      const metric = {
        id: 'v1-referer',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
      };

      const request = createRequest(metric, {
        referer: 'https://example.com/page',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      setEnv('NODE_ENV', originalEnv);
      setEnv('ALLOWED_ORIGINS', originalOrigins);
    });

    it('falls back to host header when no allowed origins configured', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalOrigins = process.env.ALLOWED_ORIGINS;

      setEnv('NODE_ENV', 'production');
      setEnv('ALLOWED_ORIGINS', undefined);

      const metric = {
        id: 'v1-host',
        name: 'LCP',
        value: 2500,
        rating: 'good' as const,
        delta: 2500,
        navigationType: 'navigate',
      };

      const request = createRequest(metric, {
        host: 'localhost:3000',
        referer: 'http://localhost:3000/page',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      setEnv('NODE_ENV', originalEnv);
      setEnv('ALLOWED_ORIGINS', originalOrigins);
    });
  });

  describe('Error handling', () => {
    it('handles malformed JSON', async () => {
      const url = 'http://localhost:3000/api/analytics/web-vitals';
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: '{invalid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });
  });
});
