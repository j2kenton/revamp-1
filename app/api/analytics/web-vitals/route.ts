/**
 * Web Vitals Analytics Endpoint
 * POST /api/analytics/web-vitals - Receive and store web vitals metrics
 */

import { NextRequest } from 'next/server';
import { logInfo, logError } from '@/utils/logger';
import { getRedisClient } from '@/lib/redis/client';
import { checkRateLimit } from '@/lib/rate-limiter';

interface WebVitalsMetric {
  id: string;
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
  attribution?: Record<string, unknown>;
}

/**
 * Valid Core Web Vitals metric names
 * CLS: Cumulative Layout Shift
 * FID: First Input Delay (deprecated, replaced by INP)
 * LCP: Largest Contentful Paint
 * FCP: First Contentful Paint
 * INP: Interaction to Next Paint
 * TTFB: Time to First Byte
 */
const VALID_METRICS = ['CLS', 'FID', 'LCP', 'FCP', 'INP', 'TTFB'] as const;

/**
 * Maximum size for attribution data (10KB)
 */
const MAX_ATTRIBUTION_SIZE = 10 * 1024; // 10KB in bytes

/**
 * Validate origin to prevent abuse from unauthorized domains
 */
function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // In development, allow all origins
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // Get allowed origins from environment variable
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

  // If no allowed origins configured, fall back to checking the host header
  if (allowedOrigins.length === 0) {
    const host = request.headers.get('host');
    if (host && (origin?.includes(host) || referer?.includes(host))) {
      return true;
    }
    return false;
  }

  // Check if origin or referer matches any allowed origin
  if (origin) {
    return allowedOrigins.some((allowed) => origin.includes(allowed));
  }

  if (referer) {
    return allowedOrigins.some((allowed) => referer.includes(allowed));
  }

  return false;
}

/**
 * Calculate size of attribution object in bytes
 */
function getAttributionSize(attribution?: Record<string, unknown>): number {
  if (!attribution) return 0;
  return JSON.stringify(attribution).length;
}

/**
 * POST /api/analytics/web-vitals
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validate origin to prevent abuse from unauthorized domains
    if (!validateOrigin(request)) {
      logError('Web vitals rejected: invalid origin', {
        origin: request.headers.get('origin'),
        referer: request.headers.get('referer'),
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized origin',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Rate limiting: Prevent clients from flooding logs
    // Use IP address as identifier (10 requests per minute)
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown';

    try {
      const redis = getRedisClient();
      const rateLimitResult = await checkRateLimit(redis, `webvitals:${ip}`, {
        maxRequests: 10,
        windowSeconds: 60,
        keyPrefix: 'ratelimit:webvitals',
      });

      if (!rateLimitResult.allowed) {
        logError('Web vitals rate limit exceeded', {
          ip,
          limit: rateLimitResult.limit,
          resetAt: rateLimitResult.resetAt,
        });

        return new Response(
          JSON.stringify({
            success: false,
            error: 'Rate limit exceeded',
            resetAt: rateLimitResult.resetAt.toISOString(),
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': rateLimitResult.limit.toString(),
              'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
              'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
            },
          }
        );
      }
    } catch (error) {
      // If Redis is unavailable, log error but continue (fail open)
      logError('Rate limiting check failed, allowing request', error);
    }

    const metric: WebVitalsMetric = await request.json();

    // 3. Validate metric name against allowlist
    if (
      !metric.name ||
      !VALID_METRICS.includes(metric.name as (typeof VALID_METRICS)[number])
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid metric name. Must be one of: ${VALID_METRICS.join(', ')}`,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 4. Validate metric data structure
    if (typeof metric.value !== 'number') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid metric data: value must be a number',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 5. Validate attribution size to prevent excessive data
    const attributionSize = getAttributionSize(metric.attribution);
    if (attributionSize > MAX_ATTRIBUTION_SIZE) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Attribution data too large. Maximum size: ${MAX_ATTRIBUTION_SIZE} bytes`,
        }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user agent and other context
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const referer = request.headers.get('referer') || 'unknown';

    // Log the metric with security context
    logInfo('Web Vital recorded', {
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
      userAgent,
      referer,
      navigationType: metric.navigationType,
      ip,
      attributionSize,
    });

    // In production, you would:
    // 1. Store in a time-series database (e.g., InfluxDB, Prometheus)
    // 2. Send to analytics service (e.g., Google Analytics, Datadog)
    // 3. Aggregate and visualize in a dashboard
    //
    // For now, we're just logging it

    // Optional: Store in Redis for recent metrics
    // const { getRedisClient } = await import('@/lib/redis/client');
    // const redis = getRedisClient();
    // const key = `web-vitals:${metric.name}:${Date.now()}`;
    // await redis.setex(key, 86400, JSON.stringify(metric)); // Store for 24 hours

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logError('Failed to process web vitals', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
