/**
 * Message Status Icon
 * Displays the appropriate icon based on message status
 */

'use client';

import { CheckIcon, CloseIcon, LoadingSpinner } from '@/components/ui/icons';
import type { MessageDTO } from '@/types/models';

interface MessageStatusIconProps {
  status: MessageDTO['status'];
}

export function MessageStatusIcon({ status }: MessageStatusIconProps) {
  switch (status) {
    case 'sending':
      return <LoadingSpinner className="h-4 w-4" />;
    case 'sent':
      return <CheckIcon className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <CloseIcon className="h-4 w-4 text-red-500" />;
    default:
      return null;
  }
}
