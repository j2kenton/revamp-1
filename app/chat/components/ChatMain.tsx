/**
 * Chat Main
 * Error-bounded message history + input, the body of the chat shell
 */

'use client';

import type { MessageDTO } from '@/types/models';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';

interface ChatMainProps {
  chatId?: string;
  liveMessages: MessageDTO[];
  onSendMessage: (content: string) => void;
  isStreaming: boolean;
  error: Error | null;
  rateLimitSeconds: number | null;
  onNewChat: () => void;
}

export function ChatMain({
  chatId,
  liveMessages,
  onSendMessage,
  isStreaming,
  error,
  rateLimitSeconds,
  onNewChat,
}: ChatMainProps) {
  return (
    <ChatErrorBoundary onReset={onNewChat}>
      <main id="chat-main" className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <MessageList chatId={chatId} liveMessages={liveMessages} />
        </div>

        <div className="border-t border-gray-200 bg-[var(--background)] dark:border-gray-700 dark:bg-gray-900">
          <ChatInput
            onSendMessage={onSendMessage}
            isStreaming={isStreaming}
            error={error}
            rateLimitSeconds={rateLimitSeconds}
            onNewChat={onNewChat}
          />
        </div>
      </main>
    </ChatErrorBoundary>
  );
}
