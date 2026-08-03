/**
 * Send Button
 * Submits the current message; shows a spinner while streaming
 */

'use client';

import clsx from 'clsx';
import { LoadingSpinner, SendIcon } from '@/components/ui/icons';
import { STRINGS } from '@/lib/constants/strings';

interface SendButtonProps {
  isStreaming: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}

export function SendButton({
  isStreaming,
  canSubmit,
  onSubmit,
}: SendButtonProps) {
  return (
    <button
      onClick={onSubmit}
      disabled={!canSubmit}
      className={clsx(
        'flex-1 rounded-md px-4 py-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:flex-initial',
        {
          'cursor-pointer bg-blue-600 text-white hover:bg-blue-700':
            canSubmit,
          'cursor-not-allowed bg-gray-300 text-gray-500': !canSubmit,
        },
      )}
      aria-label={STRINGS.input.sendButtonAria}
      aria-disabled={!canSubmit}
    >
      {isStreaming ? (
        <div className="flex items-center gap-2">
          <LoadingSpinner className="h-4 w-4 border-white border-t-transparent" />
          <span>{STRINGS.status.loading}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <SendIcon className="h-5 w-5" />
          <span>{STRINGS.input.sendButton}</span>
        </div>
      )}
    </button>
  );
}
