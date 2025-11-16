/**
 * Chat Input Component
 * Message input with validation, keyboard shortcuts, and character counter
 */

'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useSendMessage } from '@/app/chat/hooks/useSendMessage';
import clsx from 'clsx';

const MAX_LENGTH = 4000;
const DEBOUNCE_MS = 300;

interface ChatInputProps {
  chatId: string | null;
  onChatCreated?: (chatId: string) => void;
}

export function ChatInput({ chatId, onChatCreated }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [debouncedLength, setDebouncedLength] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const { sendMessage, isLoading, error } = useSendMessage(chatId);

  // Debounced character count update
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedLength(message.length);
    }, DEBOUNCE_MS);

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

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    try {
      const result = await sendMessage({
        content: trimmed,
        chatId: chatId || undefined,
      });

      // Clear input on success
      setMessage('');

      // Notify parent of new chat creation
      if (result?.chatId && !chatId && onChatCreated) {
        onChatCreated(result.chatId);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't process if IME composition is in progress
    if (isComposing) return;

    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isNearLimit = message.length > MAX_LENGTH * 0.9;
  const isOverLimit = message.length > MAX_LENGTH;
  const canSubmit = message.trim().length > 0 && !isOverLimit && !isLoading;

  return (
    <div className="p-4">
      {error && (
        <div
          className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error.message || 'Failed to send message. Please try again.'}
        </div>
      )}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
          disabled={isLoading}
          className={clsx(
            'w-full resize-none rounded-lg border px-4 py-3 pr-32 focus:outline-none focus:ring-2',
            {
              'border-gray-300 focus:border-blue-500 focus:ring-blue-500':
                !isOverLimit,
              'border-red-300 focus:border-red-500 focus:ring-red-500':
                isOverLimit,
              'cursor-not-allowed opacity-50': isLoading,
            }
          )}
          rows={1}
          maxLength={MAX_LENGTH}
          aria-label="Message input"
          aria-invalid={isOverLimit}
          aria-describedby="char-counter"
        />

        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          {/* Character counter */}
          <span
            id="char-counter"
            className={clsx('text-xs font-medium', {
              'text-gray-400': !isNearLimit,
              'text-orange-500': isNearLimit && !isOverLimit,
              'text-red-500': isOverLimit,
            })}
            aria-live="polite"
          >
            {debouncedLength} / {MAX_LENGTH}
          </span>

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={clsx(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              {
                'bg-blue-600 text-white hover:bg-blue-700': canSubmit,
                'cursor-not-allowed bg-gray-300 text-gray-500': !canSubmit,
              }
            )}
            aria-label="Send message"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                <span>Sending</span>
              </div>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </div>

      <div className="mt-2 text-xs text-gray-500">
        <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5">
          Enter
        </kbd>{' '}
        to send •{' '}
        <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5">
          Shift
        </kbd>
        {' + '}
        <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5">
          Enter
        </kbd>{' '}
        for new line
      </div>
    </div>
  );
}
