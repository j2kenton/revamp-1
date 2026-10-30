/**
 * Virtual Message Row
 * Positions a single virtualized row and reports its measured height back
 * to the virtualizer
 */

'use client';

import type { VirtualItem } from '@tanstack/react-virtual';
import type { MessageDTO } from '@/types/models';
import { ChatMessage } from './ChatMessage';

interface VirtualMessageRowProps {
  virtualItem: VirtualItem;
  message: MessageDTO;
  measureElementRef: (node: HTMLDivElement | null) => void;
  userPhotoUrl?: string | null;
}

export function VirtualMessageRow({
  virtualItem,
  message,
  measureElementRef,
  userPhotoUrl,
}: VirtualMessageRowProps) {
  return (
    <div
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
        isStreaming={message.status === 'sending'}
        userPhotoUrl={userPhotoUrl}
      />
    </div>
  );
}
