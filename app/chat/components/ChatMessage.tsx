/**
 * Chat Message Component
 * Renders individual messages with status indicators
 */

'use client';

import { formatDistanceToNow } from 'date-fns';
import type { MessageDTO } from '@/types/models';
import clsx from 'clsx';

interface ChatMessageProps {
  message: MessageDTO;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const getStatusIcon = () => {
    switch (message.status) {
      case 'sending':
        return (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
        );
      case 'sent':
        return (
          <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        );
      case 'failed':
        return (
          <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={clsx('flex gap-3', {
        'justify-end': isUser,
        'justify-start': isAssistant,
      })}
    >
      {/* Avatar */}
      {isAssistant && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
          </svg>
        </div>
      )}

      {/* Message bubble */}
      <div
        className={clsx('flex max-w-3xl flex-col gap-2 rounded-lg px-4 py-3', {
          'bg-blue-600 text-white': isUser,
          'bg-white text-gray-900 shadow-sm': isAssistant,
        })}
      >
        <div className="whitespace-pre-wrap break-words text-sm">
          {message.content}
        </div>

        <div
          className={clsx('flex items-center gap-2 text-xs', {
            'text-blue-100': isUser,
            'text-gray-500': isAssistant,
          })}
        >
          <span>
            {formatDistanceToNow(new Date(message.createdAt), {
              addSuffix: true,
            })}
          </span>
          {getStatusIcon()}
          {message.metadata?.tokensUsed && (
            <span className="ml-2">
              {message.metadata.tokensUsed} tokens
            </span>
          )}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-700 text-white">
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
