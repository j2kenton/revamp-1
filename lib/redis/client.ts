/**
 * Redis Client Configuration
 * Manages Redis connection for session storage and rate limiting
 */

import Redis from 'ioredis';
import { logError, logInfo } from '@/utils/logger';

let redisClient: Redis | null = null;

/**
 * Get Redis configuration from environment
 */
function getRedisConfig(): {
  host: string;
  port: number;
  password?: string;
  tls?: boolean;
} {
  // Support both REDIS_URL and individual config
  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL);
    return {
      host: url.hostname,
      port: parseInt(url.port || '6379', 10),
      password: url.password || undefined,
      tls: url.protocol === 'rediss:',
    };
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true',
  };
}

/**
 * Create and configure Redis client with connection pooling
 */
export function createRedisClient(): Redis {
  const config = getRedisConfig();

  const client = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    ...(config.tls && {
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    }),
    retryStrategy: (times) => {
      // Exponential backoff with max 5 seconds
      const delay = Math.min(times * 100, 5000);
      logInfo('Redis retry attempt', { attempt: times, delay });
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    lazyConnect: true,
    // Connection pool settings
    connectTimeout: 10000, // 10 seconds
    keepAlive: 30000, // 30 seconds
    family: 4, // IPv4
  });

  client.on('connect', () => {
    logInfo('Redis client connected', {
      host: config.host,
      port: config.port,
    });
  });

  client.on('error', (error) => {
    logError('Redis client error', error);
  });

  client.on('close', () => {
    logInfo('Redis client connection closed');
  });

  return client;
}

/**
 * Get Redis client (singleton)
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }

  return redisClient;
}

/**
 * Initialize Redis connection
 * Should be called on server startup
 */
export async function initRedis(): Promise<void> {
  try {
    const client = getRedisClient();
    await client.connect();
    logInfo('Redis initialized successfully');
  } catch (error) {
    logError('Failed to initialize Redis', error);
    throw error;
  }
}

/**
 * Close Redis connection
 * Should be called on server shutdown
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logInfo('Redis connection closed');
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient?.status === 'ready';
}

/**
 * Get Redis client status
 */
export function getRedisStatus(): {
  connected: boolean;
  status: string | null;
} {
  return {
    connected: isRedisConnected(),
    status: redisClient?.status || null,
  };
}

/**
 * Health check for Redis connection
 */
export async function healthCheck(): Promise<boolean> {
  if (!redisClient) {
    return false;
  }

  try {
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (error) {
    logError('Redis health check failed', error);
    return false;
  }
}

/**
 * Periodic health check (call this on a schedule)
 */
let healthCheckInterval: NodeJS.Timeout | null = null;

export function startHealthCheck(intervalMs: number = 30000) {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(async () => {
    const healthy = await healthCheck();
    if (!healthy) {
      logError('Redis health check failed - connection may be down', null);
    }
  }, intervalMs);

  logInfo('Redis health check started', { intervalMs });
}

export function stopHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    logInfo('Redis health check stopped');
  }
}
