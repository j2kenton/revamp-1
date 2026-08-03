/**
 * New Chat Button
 * Clears the current conversation and starts a new one
 */

'use client';

import clsx from 'clsx';
import { NewChatIcon } from '@/components/ui/icons';
import { STRINGS } from '@/lib/constants/strings';

interface NewChatButtonProps {
  onNewChat: () => void;
}

export function NewChatButton({ onNewChat }: NewChatButtonProps) {
  return (
    <button
      onClick={onNewChat}
      aria-label={STRINGS.chat.header.newChatAriaLabel}
      title={STRINGS.chat.header.newChatTooltip}
      className={clsx(
        'flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm font-medium',
        'text-gray-700 hover:bg-gray-100',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
        'dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700',
      )}
    >
      <NewChatIcon className="h-4 w-4" />
      <span>{STRINGS.actions.newChat}</span>
    </button>
  );
}
