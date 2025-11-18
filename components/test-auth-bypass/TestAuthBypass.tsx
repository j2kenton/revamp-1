import type { ReactNode } from 'react';

interface BypassAuthScriptProps {
  isEnabled: boolean;
}

export function TestAuthBypass({
  isEnabled,
}: BypassAuthScriptProps): ReactNode {
  if (!isEnabled) {
    return null;
  }

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: 'window.__BYPASS_AUTH__ = true;',
      }}
    />
  );
}
