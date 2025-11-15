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
 * Create and configure Redis client
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
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
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
