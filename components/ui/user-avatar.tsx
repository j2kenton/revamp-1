/**
 * UserAvatar
 * Reusable avatar component with image or initial fallback
 */

'use client';

import type { ComponentProps } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

type AvatarSize = 'sm' | 'md' | 'lg';

interface UserAvatarProps {
  src?: string | null;
  alt: string;
  fallbackLabel: string;
  size?: AvatarSize;
  className?: string;
  imageProps?: Omit<ComponentProps<typeof Image>, 'src' | 'alt'>;
}

const SIZE_CLASSNAME: Record<AvatarSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
};

export function UserAvatar({
  src,
  alt,
  fallbackLabel,
  size = 'md',
  className,
  imageProps,
}: UserAvatarProps) {
  const dimensionClass = SIZE_CLASSNAME[size];
  const fallbackInitial =
    fallbackLabel.trim().charAt(0)?.toUpperCase() || '?';

  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        className={cn('rounded-full object-cover', dimensionClass, className)}
        {...imageProps}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-gray-300 text-xs font-medium text-gray-700 dark:bg-gray-600 dark:text-gray-100',
        dimensionClass,
        className,
      )}
      role="img"
      aria-label={alt}
    >
      {fallbackInitial}
    </div>
  );
}
