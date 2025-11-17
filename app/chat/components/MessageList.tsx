/**
 * Message List Component
 * Displays chat messages with optimistic updates and virtual scrolling
 */

'use client';

import { useEffect, useRef } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

import type { MessageDTO } from '@/types/models';
import { useFetchChatHistory } from '@/app/chat/hooks/useFetchChatHistory';

import { ChatMessage } from './ChatMessage';
import { MessageSkeleton } from './MessageSkeleton';

interface MessageListProps {
  chatId: string | null;
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
    estimateSize: () => 120, // Estimated height of each message
    overscan: 5, // Number of items to render outside visible area
  });

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
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <svg
              className="h-8 w-8 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            Start a conversation
          </h3>
          <p className="text-sm text-gray-500">
            Type a message below to begin chatting with AI
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center" role="alert">
        <div className="text-center">
          <div className="mb-4 mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            Failed to load messages
          </h3>
          <p className="text-sm text-gray-500">{error.message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        {[1, 2, 3].map((i) => (
          <MessageSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto p-6"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={isLoading}
      aria-label="Chat message history"
    >
      {allMessages.length === 0 ? (
        <div className="text-center text-gray-500">
          <p>No messages yet. Start the conversation!</p>
        </div>
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
                ref={rowVirtualizer.measureElement}
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
