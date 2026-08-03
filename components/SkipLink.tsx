/**
 * Skip Link
 * Visually hidden until focused; lets keyboard/screen-reader users jump past
 * repeated header content straight to the main content region.
 */

import type { ReactNode } from 'react';

interface SkipLinkProps {
  targetId: string;
  children: ReactNode;
}

export function SkipLink({ targetId, children }: SkipLinkProps) {
  return (
    <a href={`#${targetId}`} className="skip-link">
      {children}
    </a>
  );
}
