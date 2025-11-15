/**
 * Performance Monitoring Utilities
 * Track and measure application performance
 */

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Performance timer for measuring operation duration
 */
export class PerformanceTimer {
  private startTime: number;
  private name: string;
  private metadata?: Record<string, unknown>;

  constructor(name: string, metadata?: Record<string, unknown>) {
    this.name = name;
    this.metadata = metadata;
    this.startTime = performance.now();
  }

  /**
   * End the timer and return the metric
   */
  end(): PerformanceMetric {
    const duration = performance.now() - this.startTime;
    return {
      name: this.name,
      duration,
      timestamp: Date.now(),
      metadata: this.metadata,
    };
  }

  /**
   * End the timer and log the result
   */
  endAndLog(): PerformanceMetric {
    const metric = this.end();

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[Performance] ${metric.name}: ${metric.duration.toFixed(2)}ms`,
        metric.metadata || '',
      );
    }

    return metric;
  }
}

/**
 * Measure the execution time of an async function
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<{ result: T; metric: PerformanceMetric }> {
  const timer = new PerformanceTimer(name, metadata);

  try {
    const result = await fn();
    const metric = timer.end();
    return { result, metric };
  } catch (error) {
    timer.end();
    throw error;
  }
}

/**
 * Measure the execution time of a sync function
 */
export function measure<T>(
  name: string,
  fn: () => T,
  metadata?: Record<string, unknown>,
): { result: T; metric: PerformanceMetric } {
  const timer = new PerformanceTimer(name, metadata);

  try {
    const result = fn();
    const metric = timer.end();
    return { result, metric };
  } catch (error) {
    timer.end();
    throw error;
  }
}

/**
 * Report Core Web Vitals (client-side only)
 */
export function reportWebVitals(metric: {
  id: string;
  name: string;
  value: number;
  label: 'web-vital' | 'custom';
}): void {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Web Vital]', metric.name, metric.value);
  }

  // TODO: Send to analytics service (e.g., Vercel Analytics, Google Analytics)
  // Example: sendToAnalytics(metric);
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}
