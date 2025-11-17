/**
 * Web Vitals Reporter Component
 * Initializes Web Vitals monitoring on the client side
 */

'use client';

import { useEffect } from 'react';
import { initWebVitals } from '@/lib/monitoring/web-vitals';

const disableWebVitalsReporting =
  process.env.NEXT_PUBLIC_TEST_AUTH_MODE === 'true';

export function WebVitalsReporter() {
  useEffect(() => {
    if (disableWebVitalsReporting) {
      return;
    }
    // Initialize web vitals monitoring once on mount
    initWebVitals();
  }, []);

  // This component doesn't render anything
  return null;
}
