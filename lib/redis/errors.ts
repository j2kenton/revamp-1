/**
 * Redis error utilities
 */

export interface RedisUnavailableErrorOptions {
  cause?: unknown;
}

export class RedisUnavailableError extends Error {
  public readonly cause: unknown;

  constructor(
    message: string = 'Redis is unavailable',
    options: RedisUnavailableErrorOptions = {},
  ) {
    super(message);
    this.name = 'RedisUnavailableError';
    this.cause = options.cause;
  }
}

export function isRedisUnavailableError(
  error: unknown,
): error is RedisUnavailableError {
  return error instanceof RedisUnavailableError;
}
