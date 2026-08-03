/**
 * useChatInputState
 * Local input state: text value, debounced character count, submit
 * debouncing, and the rate-limit countdown
 */

'use client';

import { useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import {
  CHAR_COUNT_DEBOUNCE_MS,
  MAX_MESSAGE_LENGTH,
  MESSAGE_LENGTH_WARNING_THRESHOLD,
  SEND_DEBOUNCE_MS,
} from '@/lib/constants/ui';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useAutoResizeTextarea } from '@/lib/hooks/useAutoResizeTextarea';
import { useCountdown } from '@/lib/hooks/useCountdown';
import { useSubmitDebounce } from '@/lib/hooks/useSubmitDebounce';

interface UseChatInputStateOptions {
  isStreaming: boolean;
  rateLimitSeconds?: number | null;
  onSendMessage: (content: string) => void;
}

export function useChatInputState({
  isStreaming,
  rateLimitSeconds,
  onSendMessage,
}: UseChatInputStateOptions) {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  const debouncedLength = useDebouncedValue(
    message.length,
    CHAR_COUNT_DEBOUNCE_MS,
  );
  const textareaRef = useAutoResizeTextarea(message);
  const countdown = useCountdown(rateLimitSeconds);
  const { isLocked: isDebounced, lock: lockSubmit } =
    useSubmitDebounce(SEND_DEBOUNCE_MS);

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (!trimmed || isStreaming || isDebounced || countdown !== null) {
      return;
    }

    lockSubmit();
    onSendMessage(trimmed);
    setMessage('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  const isNearLimit =
    message.length > MAX_MESSAGE_LENGTH * MESSAGE_LENGTH_WARNING_THRESHOLD;
  const isOverLimit = message.length > MAX_MESSAGE_LENGTH;
  const canSubmit =
    message.trim().length > 0 &&
    !isOverLimit &&
    !isStreaming &&
    !isDebounced &&
    countdown === null;

  return {
    message,
    textareaRef,
    debouncedLength,
    countdown,
    isNearLimit,
    isOverLimit,
    canSubmit,
    handleSubmit,
    handleKeyDown,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
  };
}
