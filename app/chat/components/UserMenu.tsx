/**
 * UserMenu
 * Profile menu with avatar trigger using shadcn/ui primitives
 */

'use client';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { UserAvatar } from '@/components/ui/user-avatar';
import { STRINGS } from '@/lib/constants/strings';

interface UserMenuProps {
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
  photoUrl?: string | null;
  onLogout: () => void;
}

export function UserMenu({ user, photoUrl, onLogout }: UserMenuProps) {
  if (!user) {
    return null;
  }

  const displayName = user.name ?? user.email ?? STRINGS.roles.user;
  const secondaryLabel = user.name && user.email ? user.email : null;
  const fallbackLabel = displayName || STRINGS.roles.user;
  const avatarAlt = user.name
    ? `${user.name} profile`
    : STRINGS.chat.header.userMenuAriaLabel;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto rounded-full p-0 hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          aria-label={STRINGS.chat.header.userMenuAriaLabel}
        >
          <UserAvatar
            src={photoUrl}
            alt={avatarAlt}
            fallbackLabel={fallbackLabel}
            size="sm"
            imageProps={{
              width: 32,
              height: 32,
              priority: true,
            }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <UserAvatar
              src={photoUrl}
              alt={avatarAlt}
              fallbackLabel={fallbackLabel}
              size="md"
              imageProps={{
                width: 40,
                height: 40,
                priority: true,
              }}
            />
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {displayName}
              </span>
              {secondaryLabel && (
                <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {secondaryLabel}
                </span>
              )}
            </div>
          </div>
          <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
            <Button
              variant="ghost"
              className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
              onClick={onLogout}
            >
              {STRINGS.actions.signOut}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
