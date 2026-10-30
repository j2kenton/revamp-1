/**
 * Chat List Item
 * One conversation row in the sidebar: title and relative timestamp
 */

'use client';

import clsx from 'clsx';
import type { ChatDTO } from '@/types/models';
import { formatRelativeTime } from '@/utils/relative-time';

interface ChatListItemProps {
  chat: ChatDTO;
  isActive: boolean;
  onSelect: (chatId: string) => void;
}

export function ChatListItem({ chat, isActive, onSelect }: ChatListItemProps) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(chat.id)}
        aria-current={isActive ? 'true' : undefined}
        className={clsx(
          'flex w-full cursor-pointer flex-col gap-1 rounded-md px-3 py-2 text-left',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          isActive
            ? 'bg-gray-100 dark:bg-gray-700'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700',
        )}
      >
        <span className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          {chat.title}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatRelativeTime(chat.updatedAt)}
        </span>
      </button>
    </li>
  );
}
