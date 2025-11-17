/**
 * Circuit Breaker Pattern for Redis
 * Implements graceful degradation when Redis is unavailable
 */

import { logError, logWarn, logInfo } from '@/utils/logger';

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_SUCCESS_THRESHOLD = 2;
const DEFAULT_TIMEOUT_MS = 30000;

enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes to close from half-open
  timeout: number; // Time in ms before attempting to close circuit
  name: string;
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  async execute<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        logWarn('Circuit breaker open, using fallback', {
          name: this.config.name,
          nextAttempt: new Date(this.nextAttempt).toISOString(),
        });

        if (fallback) {
          return fallback();
        }

        throw new Error(`Circuit breaker open for ${this.config.name}`);
      }

      // Try to recover
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logInfo('Circuit breaker attempting recovery', {
        name: this.config.name,
      });
    }

    try {
      const result = await operation();

      // Success
      this.onSuccess();
      return result;
    } catch (error) {
      // Failure
      this.onFailure();

      if (fallback) {
        logWarn('Operation failed, using fallback', {
          name: this.config.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return fallback();
      }

      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logInfo('Circuit breaker closed', { name: this.config.name });
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;

      logError('Circuit breaker opened', null, {
        name: this.config.name,
        failureCount: this.failureCount,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    logInfo('Circuit breaker manually reset', { name: this.config.name });
  }
}

// Create circuit breaker for Redis operations
export const redisCircuitBreaker = new CircuitBreaker({
  name: 'Redis',
  failureThreshold: DEFAULT_FAILURE_THRESHOLD,
  successThreshold: DEFAULT_SUCCESS_THRESHOLD,
  timeout: DEFAULT_TIMEOUT_MS,
});

/**
 * Execute Redis operation with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  fallback?: () => T
): Promise<T> {
  return redisCircuitBreaker.execute(operation, fallback);
}
