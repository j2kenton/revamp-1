/**
 * Message List Empty State
 * Displays when no chat is selected or no messages exist
 */

'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { ChatIcon } from '@/components/ui/icons';
import { STRINGS } from '@/lib/constants/strings';

enum Variant {
  NO_CHAT = 'no-chat',
  NO_MESSAGES = 'no-messages',
}

interface MessageListEmptyStateProps {
  variant: Variant;
}

export function MessageListEmptyState(props: MessageListEmptyStateProps) {
  const { variant } = props;
  if (variant === Variant.NO_CHAT) {
    return (
      <EmptyState
        icon={<ChatIcon />}
        title={STRINGS.chat.emptyState.title}
        description={STRINGS.chat.emptyState.description}
        variant="info"
      />
    );
  }

  return (
    <div className="text-center text-gray-500">
      <p>{STRINGS.chat.noMessages}</p>
    </div>
  );
}
