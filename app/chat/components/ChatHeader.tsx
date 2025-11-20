/**
 * ChatHeader
 * Branded chat header with connection status and user menu
 */

'use client';

import Image from 'next/image';
import { ThemeToggle } from '@/components/ThemeToggle';
import { STRINGS } from '@/lib/constants/strings';
import { ConnectionStatus } from './ConnectionStatus';
import { UserMenu } from './UserMenu';

interface ChatHeaderProps {
  user?: {
    name: string;
    email: string;
  } | null;
  photoUrl?: string | null;
  onLogout: () => void;
}

export function ChatHeader({ user, photoUrl, onLogout }: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-[var(--background)] px-6 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <h1 className="flex items-center gap-2 pr-1 text-4xl font-bold text-gray-900 dark:text-gray-100">
          <span>{STRINGS.chat.header.brandLead}</span>
          <Image
            src="/gemini-style-logo.png"
            alt={STRINGS.chat.header.logoAlt}
            width={40}
            height={40}
            priority
            className="h-10 w-10"
          />
          <span>{STRINGS.chat.header.productName}</span>
        </h1>
        <ConnectionStatus />
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <UserMenu user={user} photoUrl={photoUrl} onLogout={onLogout} />
      </div>
    </header>
  );
}
