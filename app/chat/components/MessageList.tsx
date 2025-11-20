/**
 * Message List Component
 * Displays chat messages with optimistic updates and virtual scrolling
 */

'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { MessageDTO } from '@/types/models';
import { useFetchChatHistory } from '@/app/chat/hooks/useFetchChatHistory';
import { useProfilePhoto } from '@/lib/auth/useProfilePhoto';
import { ChatMessage } from './ChatMessage';
import { MessageListEmptyState } from './MessageListEmptyState';
import { MessageListErrorState } from './MessageListErrorState';
import { MessageListLoadingState } from './MessageListLoadingState';
import {
  ESTIMATED_MESSAGE_HEIGHT_PX,
  VIRTUAL_SCROLL_OVERSCAN_COUNT,
} from '@/lib/constants/ui';
import { STRINGS } from '@/lib/constants/strings';

interface MessageListProps {
  chatId?: string;
  liveMessages?: MessageDTO[];
}

export function MessageList({ chatId, liveMessages }: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { messages, isLoading, error } = useFetchChatHistory(chatId ?? null);
  const { photoUrl: userPhotoUrl } = useProfilePhoto();

  const allMessages = useMemo(() => {
    if (!liveMessages?.length) {
      return messages;
    }

    const merged = [...messages];
    const indexMap = new Map<string, number>();

    merged.forEach((message, index) => {
      indexMap.set(message.id, index);
    });

    liveMessages.forEach((message) => {
      const existingIndex = indexMap.get(message.id);
      if (typeof existingIndex === 'number') {
        merged[existingIndex] = message;
      } else {
        indexMap.set(message.id, merged.length);
        merged.push(message);
      }
    });

    return merged.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [liveMessages, messages]);

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
            const streamInProgress = message.status === 'sending';

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
                <ChatMessage
                  message={message}
                  isStreaming={streamInProgress}
                  userPhotoUrl={userPhotoUrl}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
