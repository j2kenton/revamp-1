/**
 * Chat Input Component
 * Message input with validation, keyboard shortcuts, and character counter
 */

'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import clsx from 'clsx';
import { LoadingSpinner } from '@/components/ui/icons';
import {
  MAX_MESSAGE_LENGTH,
  CHAR_COUNT_DEBOUNCE_MS,
  SEND_DEBOUNCE_MS,
  MESSAGE_LENGTH_WARNING_THRESHOLD,
} from '@/lib/constants/ui';
import { STRINGS } from '@/lib/constants/strings';

const COUNTDOWN_INTERVAL_MS = 1000;
const MIN_COUNTDOWN_VALUE = 1;
const TEXTAREA_ROW_COUNT = 3;
const IMMEDIATE_TIMEOUT_MS = 0;

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  isStreaming: boolean;
  error?: Error | null;
  rateLimitSeconds?: number | null;
  onNewChat?: () => void;
}

export function ChatInput({
  onSendMessage,
  isStreaming,
  error,
  rateLimitSeconds,
  onNewChat,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [debouncedLength, setDebouncedLength] = useState(0);
  const [isDebounced, setIsDebounced] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const sendDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced character count update
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedLength(message.length);
    }, CHAR_COUNT_DEBOUNCE_MS);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [message]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  useEffect(() => {
    return () => {
      if (sendDebounceRef.current) {
        clearTimeout(sendDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const nextCountdown =
      typeof rateLimitSeconds === 'number' ? rateLimitSeconds : null;

    let frameId: number | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    if (typeof window === 'undefined') {
      timeoutId = setTimeout(() => setCountdown(nextCountdown), IMMEDIATE_TIMEOUT_MS);
    } else {
      frameId = window.requestAnimationFrame(() => {
        setCountdown(nextCountdown);
      });
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [rateLimitSeconds]);

  useEffect(() => {
    if (countdown === null) {
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => {
        if (prev === null) {
          return null;
        }
        if (prev <= MIN_COUNTDOWN_VALUE) {
          return null;
        }
        return prev - 1;
      });
    }, COUNTDOWN_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (!trimmed || isStreaming || isDebounced || countdown !== null) {
      return;
    }

    setIsDebounced(true);
    sendDebounceRef.current = setTimeout(() => {
      setIsDebounced(false);
    }, SEND_DEBOUNCE_MS);

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

  const isNearLimit =
    message.length > MAX_MESSAGE_LENGTH * MESSAGE_LENGTH_WARNING_THRESHOLD;
  const isOverLimit = message.length > MAX_MESSAGE_LENGTH;
  const canSubmit =
    message.trim().length > 0 &&
    !isOverLimit &&
    !isStreaming &&
    !isDebounced &&
    countdown === null;
  const errorMessage = error?.message || STRINGS.errors.sendFailed;

  return (
    <div className="p-4">
      {error && (
        <div
          className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800"
          role="alert"
          aria-live="assertive"
        >
          {errorMessage}
        </div>
      )}
      {countdown !== null && (
        <div
          className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800"
          role="status"
          aria-live="polite"
        >
          {STRINGS.errors.rateLimitCountdown(countdown)}
        </div>
      )}

      <div
        className="flex items-end gap-3"
        style={{
          flexDirection: 'column',
        }}
      >
        <div className="flex w-full gap-3">
          <div className="flex flex-1 justify-end">
            <textarea
              id="chat-input"
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder={STRINGS.input.placeholder}
              disabled={isStreaming || countdown !== null}
              className={clsx(
                'w-full resize-none rounded-lg border px-4 py-3 focus:outline-none focus:ring-2',
                {
                  'border-gray-300 focus:border-blue-500 focus:ring-blue-500':
                    !isOverLimit,
                  'border-red-300 focus:border-red-500 focus:ring-red-500':
                    isOverLimit,
                  'cursor-not-allowed opacity-50':
                    isStreaming || countdown !== null,
                },
              )}
              rows={TEXTAREA_ROW_COUNT}
              aria-label={STRINGS.input.ariaLabel}
              aria-invalid={isOverLimit}
              aria-describedby="char-counter"
            />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <div className="text-xs font-medium">
              <span
                id="char-counter"
                className={clsx({
                  'text-gray-400': !isNearLimit,
                  'text-orange-500': isNearLimit && !isOverLimit,
                  'text-red-500': isOverLimit,
                })}
                aria-live="polite"
              >
                {STRINGS.input.characterCount(
                  debouncedLength,
                  MAX_MESSAGE_LENGTH,
                )}
              </span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={clsx(
                'rounded-md px-6 py-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                {
                  'cursor-pointer bg-blue-600 text-white hover:bg-blue-700':
                    canSubmit,
                  'cursor-not-allowed bg-gray-300 text-gray-500': !canSubmit,
                },
              )}
              aria-label={STRINGS.input.sendButtonAria}
              aria-disabled={!canSubmit}
            >
              {isStreaming ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner className="h-4 w-4 border-white border-t-transparent" />
                  <span>{STRINGS.status.loading}</span>
                </div>
              ) : (
                STRINGS.input.sendButton
              )}
            </button>
            {onNewChat && (
              <button
                onClick={onNewChat}
                className="cursor-pointer rounded-md bg-gray-300 px-6 py-1 text-sm font-medium text-gray-700 hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500"
              >
                {STRINGS.actions.newChat}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
