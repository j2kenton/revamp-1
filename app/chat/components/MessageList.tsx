/**
 * Message List Component
 * Displays chat messages with optimistic updates and virtual scrolling
 */

'use client';

import { useMemo } from 'react';
import type { MessageDTO } from '@/types/models';
import { useFetchChatHistory } from '@/app/chat/hooks/useFetchChatHistory';
import { useProfilePhoto } from '@/lib/auth/useProfilePhoto';
import { MessageListEmptyState } from './MessageListEmptyState';
import { MessageListErrorState } from './MessageListErrorState';
import { MessageListLoadingState } from './MessageListLoadingState';
import { VirtualizedMessageList } from './VirtualizedMessageList';

interface MessageListProps {
  chatId?: string;
  liveMessages?: MessageDTO[];
}

function mergeMessages(
  liveMessages: MessageDTO[] | undefined,
  persistedMessages: MessageDTO[],
): MessageDTO[] {
  if (!liveMessages?.length) {
    return persistedMessages;
  }

  const merged = [...persistedMessages];
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
}

export function MessageList({ chatId, liveMessages }: MessageListProps) {
  const { messages, isLoading, error } = useFetchChatHistory(chatId);
  const { photoUrl: userPhotoUrl } = useProfilePhoto();

  const allMessages = useMemo(
    () => mergeMessages(liveMessages, messages),
    [liveMessages, messages],
  );

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

  if (allMessages.length === 0) {
    return <MessageListEmptyState variant="no-messages" />;
  }

  return (
    <VirtualizedMessageList
      messages={allMessages}
      isLoading={isLoading}
      userPhotoUrl={userPhotoUrl}
    />
  );
}
