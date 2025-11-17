/**
 * Web Vitals Reporter Component
 * Initializes Web Vitals monitoring on the client side
 */

'use client';

// 1. React/Next
import { useEffect } from 'react';

// 3. @/ absolute
import { initWebVitals } from '@/lib/monitoring/web-vitals';

export function WebVitalsReporter() {
  useEffect(() => {
    // Initialize web vitals monitoring once on mount
    initWebVitals();
  }, []);

  // This component doesn't render anything
  return null;
}
