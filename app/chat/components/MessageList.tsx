/**
 * Message List Component
 * Displays chat messages with optimistic updates and virtual scrolling
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { MessageDTO } from '@/types/models';
import { useFetchChatHistory } from '@/app/chat/hooks/useFetchChatHistory';
import { ChatMessage } from './ChatMessage';
import { MessageListEmptyState } from './MessageListEmptyState';
import { MessageListErrorState } from './MessageListErrorState';
import { MessageListLoadingState } from './MessageListLoadingState';
import { ESTIMATED_MESSAGE_HEIGHT_PX, VIRTUAL_SCROLL_OVERSCAN_COUNT } from '@/lib/constants/ui';
import { STRINGS } from '@/lib/constants/strings';

interface MessageListProps {
  chatId?: string;
  streamingMessage?: {
    id: string;
    content: string;
    isComplete: boolean;
    contextTruncated?: boolean;
    messagesRemoved?: number;
  } | null;
}

export function MessageList({ chatId, streamingMessage }: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { messages, isLoading, error } = useFetchChatHistory(chatId);

  // Combine messages with streaming message
  const streamingMetadata =
    streamingMessage &&
    (streamingMessage.contextTruncated || typeof streamingMessage.messagesRemoved === 'number')
      ? {
          contextTruncated: streamingMessage.contextTruncated ?? false,
          messagesRemoved: streamingMessage.messagesRemoved,
        }
      : null;

  const allMessages = streamingMessage
    ? [
        ...messages,
        {
          id: streamingMessage.id,
          chatId: chatId || '',
          role: 'assistant' as const,
          content: streamingMessage.content,
          status: streamingMessage.isComplete ? 'sent' : 'sending',
          parentMessageId: null,
          metadata: streamingMetadata,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies MessageDTO,
      ]
    : messages;

  // Virtual scrolling setup
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack's hook manages its own memoization
  const rowVirtualizer = useVirtualizer({
    count: allMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT_PX,
    overscan: VIRTUAL_SCROLL_OVERSCAN_COUNT,
  });

  // Provide a stable ref callback to avoid invoking undefined TanStack helpers
  const measureElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      const measure = rowVirtualizer.measureElement;
      if (typeof measure === 'function') {
        measure(node);
      }
    },
    [rowVirtualizer],
  );

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (parentRef.current && allMessages.length > 0) {
      // Scroll to the last item
      rowVirtualizer.scrollToIndex(allMessages.length - 1, {
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, [allMessages.length, rowVirtualizer]);

  if (!chatId) {
    return <MessageListEmptyState variant="no-chat" />;
  }

  if (error) {
    return (
      <div role="alert">
        <MessageListErrorState error={error} />
      </div>
    );
  }

  if (isLoading) {
    return <MessageListLoadingState />;
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto p-6"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={isLoading}
      aria-label={STRINGS.chat.messageHistory}
    >
      {allMessages.length === 0 ? (
        <MessageListEmptyState variant="no-messages" />
      ) : (
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const message = allMessages[virtualItem.index];
            const activeStreamingId = streamingMessage?.id ?? null;
            const isStreamingMessage = activeStreamingId !== null && message.id === activeStreamingId;
            const streamInProgress =
              isStreamingMessage && streamingMessage ? !streamingMessage.isComplete : false;

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={measureElementRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="pb-4"
              >
                <ChatMessage message={message} isStreaming={streamInProgress} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
