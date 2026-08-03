/**
 * New Chat Button
 * Clears the current conversation and starts a new one
 */

'use client';

import { PlusIcon } from '@/components/ui/icons';
import { STRINGS } from '@/lib/constants/strings';

interface NewChatButtonProps {
  onNewChat: () => void;
}

export function NewChatButton({ onNewChat }: NewChatButtonProps) {
  return (
    <button
      onClick={onNewChat}
      className="flex-1 cursor-pointer rounded-md bg-gray-300 px-4 py-1 text-sm font-medium text-gray-700 hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:flex-initial dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500"
    >
      <div className="flex items-center gap-2">
        <PlusIcon className="h-4 w-4" />
        <span>{STRINGS.actions.clear}</span>
      </div>
    </button>
  );
}
