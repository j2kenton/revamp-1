'use client';

import { useEffect, type ReactNode } from 'react';

interface BypassAuthScriptProps {
  isEnabled: boolean;
}

/**
 * SECURITY (MED-05): Replaced dangerouslySetInnerHTML with useEffect
 * This is safer as it doesn't set arbitrary HTML and only runs in client context
 */
export function TestAuthBypass({
  isEnabled,
}: BypassAuthScriptProps): ReactNode {
  useEffect(() => {
    // SECURITY: Only set bypass flag in non-production environments
    if (isEnabled && process.env.NODE_ENV !== 'production') {
      (window as unknown as { __BYPASS_AUTH__: boolean }).__BYPASS_AUTH__ =
        true;
    }

    // Cleanup on unmount
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __BYPASS_AUTH__?: boolean })
          .__BYPASS_AUTH__;
      }
    };
  }, [isEnabled]);

  // No DOM output needed - the effect handles the flag
  return null;
}
