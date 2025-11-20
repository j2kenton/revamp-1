/**
 * Health Check API Endpoint
 * GET /api/health - Returns application health status
 */

import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis/client';

const MEMORY_DEGRADED_THRESHOLD_PERCENT = 90;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const STATUS_OK = 200;
const STATUS_SERVICE_UNAVAILABLE = 503;
const JSON_INDENT_SPACES = 2;
const NO_STORE_CACHE_CONTROL = 'no-cache, no-store, must-revalidate';
const RESPONSE_TIME_HEADER = 'X-Response-Time';
const CONTENT_TYPE_JSON = 'application/json';
const MS_TIME_SUFFIX = 'ms';

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
    status: usagePercent > MEMORY_DEGRADED_THRESHOLD_PERCENT ? 'degraded' : 'healthy',
    usage: {
      heapUsed: Math.round(usage.heapUsed / BYTES_PER_MEGABYTE), // MB
      heapTotal: Math.round(usage.heapTotal / BYTES_PER_MEGABYTE), // MB
      external: Math.round(usage.external / BYTES_PER_MEGABYTE), // MB
      rss: Math.round(usage.rss / BYTES_PER_MEGABYTE), // MB
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
export async function GET(_request: NextRequest) {
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
    const statusCode =
      status === 'healthy' || status === 'degraded'
        ? STATUS_OK
        : STATUS_SERVICE_UNAVAILABLE;

    return new Response(JSON.stringify(response, null, JSON_INDENT_SPACES), {
      status: statusCode,
      headers: {
        'Content-Type': CONTENT_TYPE_JSON,
        'Cache-Control': NO_STORE_CACHE_CONTROL,
        [RESPONSE_TIME_HEADER]: `${Date.now() - startTime}${MS_TIME_SUFFIX}`,
      },
    });
  } catch (_error) {
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

    return new Response(JSON.stringify(errorResponse, null, JSON_INDENT_SPACES), {
      status: STATUS_SERVICE_UNAVAILABLE,
      headers: {
        'Content-Type': CONTENT_TYPE_JSON,
        'Cache-Control': NO_STORE_CACHE_CONTROL,
        [RESPONSE_TIME_HEADER]: `${Date.now() - startTime}${MS_TIME_SUFFIX}`,
      },
    });
  }
}
