/**
 * Web Vitals Monitoring
 * Tracks Core Web Vitals and sends them to analytics
 */

import { onCLS, onFCP, onFID, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

interface WebVitalsPayload {
  id: string;
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
  attribution?: Record<string, unknown>;
}

/**
 * Send metric to analytics endpoint
 */
async function sendToAnalytics(metric: WebVitalsPayload) {
  // In production, send to your analytics service
  // For now, we'll send to a local endpoint
  try {
    const body = JSON.stringify(metric);

    // Use sendBeacon if available for better reliability
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/web-vitals', body);
    } else {
      // Fallback to fetch
      fetch('/api/analytics/web-vitals', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
        },
        keepalive: true,
      }).catch((error) => {
        console.error('Failed to send web vitals:', error);
      });
    }
  } catch (error) {
    console.error('Error sending web vitals:', error);
  }
}

/**
 * Get rating for a metric value
 */
function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  // Thresholds based on web.dev recommendations
  const thresholds: Record<string, { good: number; poor: number }> = {
    CLS: { good: 0.1, poor: 0.25 },
    FCP: { good: 1800, poor: 3000 },
    FID: { good: 100, poor: 300 },
    INP: { good: 200, poor: 500 },
    LCP: { good: 2500, poor: 4000 },
    TTFB: { good: 800, poor: 1800 },
  };

  const threshold = thresholds[name];
  if (!threshold) return 'good';

  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Handle metric and send to analytics
 */
function handleMetric(metric: Metric) {
  const payload: WebVitalsPayload = {
    id: metric.id,
    name: metric.name,
    value: metric.value,
    rating: getRating(metric.name, metric.value),
    delta: metric.delta,
    navigationType: metric.navigationType,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Web Vitals]', payload);
  }

  // Send to analytics
  sendToAnalytics(payload);
}

/**
 * Initialize Web Vitals monitoring
 */
export function initWebVitals() {
  try {
    // Core Web Vitals
    onCLS(handleMetric);
    onFID(handleMetric);
    onLCP(handleMetric);

    // Other important metrics
    onFCP(handleMetric);
    onINP(handleMetric);
    onTTFB(handleMetric);
  } catch (error) {
    console.error('Failed to initialize web vitals:', error);
  }
}

/**
 * Report a custom metric
 */
export function reportCustomMetric(name: string, value: number, unit = 'ms') {
  const payload = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    value,
    rating: 'good' as const,
    delta: value,
    navigationType: 'custom',
    unit,
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('[Custom Metric]', payload);
  }

  sendToAnalytics(payload);
}
