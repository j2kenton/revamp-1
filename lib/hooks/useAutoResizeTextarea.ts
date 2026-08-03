/**
 * useAutoResizeTextarea
 * Grows a textarea's height to fit its content as `value` changes
 */

'use client';

import { useEffect, useRef } from 'react';

export function useAutoResizeTextarea<T>(value: T) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  return textareaRef;
}
