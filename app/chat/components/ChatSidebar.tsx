/**
 * Chat Sidebar
 * Left rail listing previous conversations with a New Chat affordance
 */

'use client';

import { STRINGS } from '@/lib/constants/strings';
import { ChatList } from './ChatList';
import { NewChatButton } from './NewChatButton';

interface ChatSidebarProps {
  activeChatId?: string;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
}

export function ChatSidebar({
  activeChatId,
  onSelectChat,
  onNewChat,
}: ChatSidebarProps) {
  return (
    <aside
      aria-label={STRINGS.chat.sidebar.ariaLabel}
      className="hidden w-64 flex-col border-r border-gray-200 bg-[var(--background)] md:flex dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {STRINGS.chat.sidebar.heading}
        </h2>
        <NewChatButton onNewChat={onNewChat} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <ChatList activeChatId={activeChatId} onSelectChat={onSelectChat} />
      </div>
    </aside>
  );
}
