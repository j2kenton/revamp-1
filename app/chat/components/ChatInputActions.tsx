/**
 * Chat Input Actions
 * Character counter, send button, and new-chat button
 */

'use client';

import { CharacterCounter } from './CharacterCounter';
import { SendButton } from './SendButton';
import { NewChatButton } from './NewChatButton';

interface ChatInputActionsProps {
  debouncedLength: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
  isStreaming: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onNewChat?: () => void;
}

export function ChatInputActions({
  debouncedLength,
  isNearLimit,
  isOverLimit,
  isStreaming,
  canSubmit,
  onSubmit,
  onNewChat,
}: ChatInputActionsProps) {
  return (
    <div className="flex flex-col justify-end gap-2">
      <CharacterCounter
        debouncedLength={debouncedLength}
        isNearLimit={isNearLimit}
        isOverLimit={isOverLimit}
      />
      <SendButton
        isStreaming={isStreaming}
        canSubmit={canSubmit}
        onSubmit={onSubmit}
      />
      {onNewChat ? <NewChatButton onNewChat={onNewChat} /> : null}
    </div>
  );
}
