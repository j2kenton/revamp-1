/**
 * Chat Input Textarea
 * Auto-resizing message textarea
 */

'use client';

import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import clsx from 'clsx';
import { STRINGS } from '@/lib/constants/strings';

const TEXTAREA_ROW_COUNT = 3;

interface ChatInputTextareaProps {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  disabled: boolean;
  isOverLimit: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function ChatInputTextarea({
  value,
  onChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  disabled,
  isOverLimit,
  textareaRef,
}: ChatInputTextareaProps) {
  return (
    <div className="flex flex-1 justify-end">
      <textarea
        id="chat-input"
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        placeholder={STRINGS.input.placeholder}
        disabled={disabled}
        className={clsx(
          'w-full resize-none rounded-lg border px-4 py-3 focus:outline-none focus:ring-2',
          {
            'border-gray-300 focus:border-blue-500 focus:ring-blue-500':
              !isOverLimit,
            'border-red-300 focus:border-red-500 focus:ring-red-500':
              isOverLimit,
            'cursor-not-allowed opacity-50': disabled,
          },
        )}
        rows={TEXTAREA_ROW_COUNT}
        aria-label={STRINGS.input.ariaLabel}
        aria-invalid={isOverLimit}
        aria-describedby="char-counter"
      />
    </div>
  );
}
