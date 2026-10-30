/**
 * Chat List
 * Sidebar list of the user's previous conversations, newest-updated first
 */

'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { ErrorIcon } from '@/components/ui/icons';
import { STRINGS } from '@/lib/constants/strings';
import { LOADING_SKELETON_COUNT } from '@/lib/constants/ui';
import { useChatList } from '../hooks/useChatList';
import { ChatListItem } from './ChatListItem';

interface ChatListProps {
  activeChatId?: string;
  onSelectChat: (chatId: string) => void;
}

function ChatListSkeleton() {
  return (
    <div
      className="animate-pulse space-y-3 px-3 py-2"
      role="status"
      aria-label={STRINGS.chat.sidebar.loadingAriaLabel}
    >
      {Array.from({ length: LOADING_SKELETON_COUNT }, (_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700"></div>
          <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700"></div>
        </div>
      ))}
    </div>
  );
}

export function ChatList({ activeChatId, onSelectChat }: ChatListProps) {
  const { chats, isLoading, error } = useChatList();

  if (isLoading) {
    return <ChatListSkeleton />;
  }

  if (error) {
    return (
      <div role="alert">
        <EmptyState
          icon={<ErrorIcon />}
          title={STRINGS.chat.sidebar.errorTitle}
          description={error.message}
          variant="error"
        />
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <p className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
        {STRINGS.chat.sidebar.empty}
      </p>
    );
  }

  return (
    <ul className="space-y-1 px-2 py-2">
      {chats.map((chat) => (
        <ChatListItem
          key={chat.id}
          chat={chat}
          isActive={chat.id === activeChatId}
          onSelect={onSelectChat}
        />
      ))}
    </ul>
  );
}
