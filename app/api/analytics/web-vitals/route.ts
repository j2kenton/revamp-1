/**
 * Web Vitals Analytics Endpoint
 * POST /api/analytics/web-vitals - Receive and store web vitals metrics
 */

import { NextRequest } from 'next/server';
import { logInfo } from '@/utils/logger';

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
 * POST /api/analytics/web-vitals
 */
export async function POST(request: NextRequest) {
  try {
    const metric: WebVitalsMetric = await request.json();

    // Validate metric data
    if (!metric.name || typeof metric.value !== 'number') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid metric data',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user agent and other context
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const referer = request.headers.get('referer') || 'unknown';

    // Log the metric
    logInfo('Web Vital recorded', {
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
      userAgent,
      referer,
      navigationType: metric.navigationType,
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
    console.error('Failed to process web vitals:', error);

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
