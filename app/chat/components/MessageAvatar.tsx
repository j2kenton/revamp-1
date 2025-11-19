/**
 * Message Avatar
 * Displays user or assistant avatar
 */

'use client';

import Image from 'next/image';
import { BellIcon, UserIcon } from '@/components/ui/icons';
import type { MessageDTO } from '@/types/models';

interface MessageAvatarProps {
  role: MessageDTO['role'];
  photoUrl?: string | null;
}

export function MessageAvatar({ role, photoUrl }: MessageAvatarProps) {
  if (role === 'assistant') {
    return (
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <BellIcon className="h-6 w-6" />
      </div>
    );
  }

  // Show user's profile photo if available
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt="User profile"
        width={40}
        height={40}
        className="flex-shrink-0 rounded-full object-cover"
        unoptimized
      />
    );
  }

  // Fallback to default user icon
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-700 text-white">
      <UserIcon className="h-6 w-6" />
    </div>
  );
}
