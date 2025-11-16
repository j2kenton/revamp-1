/**
 * Health Check API Endpoint
 * GET /api/health - Returns application health status
 */

import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis/client';

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    redis: {
      status: 'healthy' | 'unhealthy';
      latency?: number;
      error?: string;
    };
    memory: {
      status: 'healthy' | 'degraded';
      usage: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
      };
      usagePercent: number;
    };
    process: {
      status: 'healthy';
      pid: number;
      version: string;
      platform: string;
    };
  };
}

/**
 * Check Redis health and latency
 */
async function checkRedisHealth(): Promise<HealthCheckResponse['checks']['redis']> {
  try {
    const start = Date.now();
    const redis = getRedisClient();

    // Test Redis connection with a simple ping
    await redis.ping();

    const latency = Date.now() - start;

    return {
      status: 'healthy',
      latency,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check memory health
 */
function checkMemoryHealth(): HealthCheckResponse['checks']['memory'] {
  const usage = process.memoryUsage();
  const usagePercent = (usage.heapUsed / usage.heapTotal) * 100;

  return {
    status: usagePercent > 90 ? 'degraded' : 'healthy',
    usage: {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      rss: Math.round(usage.rss / 1024 / 1024), // MB
    },
    usagePercent: Math.round(usagePercent),
  };
}

/**
 * Check process health
 */
function checkProcessHealth(): HealthCheckResponse['checks']['process'] {
  return {
    status: 'healthy',
    pid: process.pid,
    version: process.version,
    platform: process.platform,
  };
}

/**
 * GET /api/health
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Run health checks in parallel
    const [redisHealth, memoryHealth, processHealth] = await Promise.all([
      checkRedisHealth(),
      Promise.resolve(checkMemoryHealth()),
      Promise.resolve(checkProcessHealth()),
    ]);

    // Determine overall status
    let status: HealthCheckResponse['status'] = 'healthy';

    if (redisHealth.status === 'unhealthy') {
      status = 'unhealthy';
    } else if (memoryHealth.status === 'degraded') {
      status = 'degraded';
    }

    const response: HealthCheckResponse = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        redis: redisHealth,
        memory: memoryHealth,
        process: processHealth,
      },
    };

    // Return appropriate status code based on health
    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

    return new Response(JSON.stringify(response, null, 2), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${Date.now() - startTime}ms`,
      },
    });
  } catch (error) {
    const errorResponse: HealthCheckResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        redis: {
          status: 'unhealthy',
          error: 'Health check failed',
        },
        memory: checkMemoryHealth(),
        process: checkProcessHealth(),
      },
    };

    return new Response(JSON.stringify(errorResponse, null, 2), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${Date.now() - startTime}ms`,
      },
    });
  }
}
