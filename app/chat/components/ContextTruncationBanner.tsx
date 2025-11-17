/**
 * Context Truncation Banner
 * Displays a warning when context has been truncated
 */

'use client';

import { WarningIcon } from '@/components/ui/icons';
import { STRINGS } from '@/lib/constants/strings';

interface ContextTruncationBannerProps {
  messagesRemoved: number;
}

export function ContextTruncationBanner({ messagesRemoved }: ContextTruncationBannerProps) {
  return (
    <div className="mb-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800 border border-amber-200">
      <div className="flex items-center gap-2">
        <WarningIcon
          className="h-4 w-4 flex-shrink-0"
          role="img"
          aria-label={STRINGS.contextTruncation.warning}
        />
        <span>{STRINGS.contextTruncation.message(messagesRemoved)}</span>
      </div>
    </div>
  );
}
