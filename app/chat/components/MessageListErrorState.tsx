/**
 * Message List Error State
 * Displays when message loading fails
 */

'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { ErrorIcon } from '@/components/ui/icons';
import { STRINGS } from '@/lib/constants/strings';

interface MessageListErrorStateProps {
  error: Error;
}

export function MessageListErrorState({ error }: MessageListErrorStateProps) {
  return (
    <EmptyState
      icon={<ErrorIcon />}
      title={STRINGS.chat.errorState.title}
      description={error.message}
      variant="error"
    />
  );
}
