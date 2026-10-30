/**
 * Send Button Label
 * Button content: a spinner while streaming, otherwise the send icon
 */

'use client';

import { LoadingSpinner, SendIcon } from '@/components/ui/icons';
import { STRINGS } from '@/lib/constants/strings';

interface SendButtonLabelProps {
  isStreaming: boolean;
}

export function SendButtonLabel({ isStreaming }: SendButtonLabelProps) {
  return isStreaming ? (
    <div className="flex items-center gap-2">
      <LoadingSpinner className="h-4 w-4 border-white border-t-transparent" />
      <span>{STRINGS.status.loading}</span>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <SendIcon className="h-5 w-5" />
      <span>{STRINGS.input.sendButton}</span>
    </div>
  );
}
