/**
 * Chat Input Component
 * Message input with validation, keyboard shortcuts, and character counter
 */

'use client';

import { useChatInputState } from '../hooks/useChatInputState';
import { ChatInputAlerts } from './ChatInputAlerts';
import { ChatInputTextarea } from './ChatInputTextarea';
import { ChatInputActions } from './ChatInputActions';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  isStreaming: boolean;
  error?: Error | null;
  rateLimitSeconds?: number | null;
  onNewChat?: () => void;
}

export function ChatInput({
  onSendMessage,
  isStreaming,
  error,
  rateLimitSeconds,
  onNewChat,
}: ChatInputProps) {
  const {
    message,
    textareaRef,
    debouncedLength,
    countdown,
    isNearLimit,
    isOverLimit,
    canSubmit,
    handleSubmit,
    handleKeyDown,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
  } = useChatInputState({ isStreaming, rateLimitSeconds, onSendMessage });

  return (
    <div className="p-4">
      <ChatInputAlerts error={error} countdown={countdown} />

      <div
        className="flex items-end gap-3"
        style={{
          flexDirection: 'column',
        }}
      >
        <div className="flex w-full gap-3">
          <ChatInputTextarea
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            disabled={isStreaming || countdown !== null}
            isOverLimit={isOverLimit}
            textareaRef={textareaRef}
          />
          <ChatInputActions
            debouncedLength={debouncedLength}
            isNearLimit={isNearLimit}
            isOverLimit={isOverLimit}
            isStreaming={isStreaming}
            canSubmit={canSubmit}
            onSubmit={handleSubmit}
            onNewChat={onNewChat}
          />
        </div>
      </div>
    </div>
  );
}
