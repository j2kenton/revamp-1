/**
 * Message List Component
 * Displays chat messages with optimistic updates
 */

'use client';

import { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { MessageSkeleton } from './MessageSkeleton';
import { useFetchChatHistory } from '@/app/chat/hooks/useFetchChatHistory';
import type { MessageDTO } from '@/types/models';

interface MessageListProps {
  chatId: string | null;
}

export function MessageList({ chatId }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, isLoading, error } = useFetchChatHistory(chatId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      ref={scrollRef}
      className="space-y-4 p-6"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={isLoading}
    >
      {messages.length === 0 ? (
        <div className="text-center text-gray-500">
          <p>No messages yet. Start the conversation!</p>
        </div>
      ) : (
        messages.map((message: MessageDTO) => (
          <ChatMessage key={message.id} message={message} />
        ))
      )}
    </div>
  );
}
