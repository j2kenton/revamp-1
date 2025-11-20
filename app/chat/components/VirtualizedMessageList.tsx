/**
 * VirtualizedMessageList
 * Virtualized renderer for chat messages
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { MessageDTO } from '@/types/models';
import {
  ESTIMATED_MESSAGE_HEIGHT_PX,
  VIRTUAL_SCROLL_OVERSCAN_COUNT,
} from '@/lib/constants/ui';
import { STRINGS } from '@/lib/constants/strings';
import { ChatMessage } from './ChatMessage';

interface VirtualizedMessageListProps {
  messages: MessageDTO[];
  isLoading: boolean;
  userPhotoUrl?: string | null;
}

export function VirtualizedMessageList({
  messages,
  isLoading,
  userPhotoUrl,
}: VirtualizedMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack's hook manages its own memoization
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT_PX,
    overscan: VIRTUAL_SCROLL_OVERSCAN_COUNT,
  });

  const measureElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      const measure = rowVirtualizer.measureElement;
      if (typeof measure === 'function') {
        measure(node);
      }
    },
    [rowVirtualizer],
  );

  useEffect(() => {
    if (parentRef.current && messages.length > 0) {
      rowVirtualizer.scrollToIndex(messages.length - 1, {
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, [messages.length, rowVirtualizer]);

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
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const message = messages[virtualItem.index];
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
    </div>
  );
}
