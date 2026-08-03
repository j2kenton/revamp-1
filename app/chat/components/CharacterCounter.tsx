/**
 * Character Counter
 * Shows the current message length against the max, colored by proximity
 */

'use client';

import clsx from 'clsx';
import { STRINGS } from '@/lib/constants/strings';
import { MAX_MESSAGE_LENGTH } from '@/lib/constants/ui';

interface CharacterCounterProps {
  debouncedLength: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
}

export function CharacterCounter({
  debouncedLength,
  isNearLimit,
  isOverLimit,
}: CharacterCounterProps) {
  return (
    <div className="hidden text-xs font-medium sm:block">
      <span
        id="char-counter"
        className={clsx({
          'text-gray-400': !isNearLimit,
          'text-orange-500': isNearLimit && !isOverLimit,
          'text-red-500': isOverLimit,
        })}
        aria-live="polite"
      >
        {STRINGS.input.characterCount(debouncedLength, MAX_MESSAGE_LENGTH)}
      </span>
    </div>
  );
}
