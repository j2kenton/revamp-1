/**
 * Message Avatar
 * Displays user or assistant avatar
 */

'use client';

import { BellIcon, UserIcon } from '@/components/ui/icons';
import type { MessageDTO } from '@/types/models';

interface MessageAvatarProps {
  role: MessageDTO['role'];
}

export function MessageAvatar({ role }: MessageAvatarProps) {
  if (role === 'assistant') {
    return (
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <BellIcon className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-700 text-white">
      <UserIcon className="h-6 w-6" />
    </div>
  );
}
