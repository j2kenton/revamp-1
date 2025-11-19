/**
 * Chat Message Component
 * Renders individual messages with status indicators
 */

'use client';

import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import type { MessageDTO } from '@/types/models';
import { MessageAvatar } from './MessageAvatar';
import { MessageStatusIcon } from './MessageStatusIcon';
import { ContextTruncationBanner } from './ContextTruncationBanner';
import { LoadingDots } from '@/components/ui/icons';
import { STRINGS } from '@/lib/constants/strings';

interface ChatMessageProps {
  message: MessageDTO;
  isStreaming?: boolean;
  userPhotoUrl?: string | null;
}

export function ChatMessage({
  message,
  isStreaming = false,
  userPhotoUrl,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const roleLabel = isUser ? STRINGS.roles.user : STRINGS.roles.assistant;
  const timeLabel = formatDistanceToNow(new Date(message.createdAt), {
    addSuffix: true,
  });

  const contextTruncated = message.metadata?.contextTruncated;
  const messagesRemoved = message.metadata?.messagesRemoved;

  return (
    <div
      className={clsx('flex gap-3', {
        'justify-end': isUser,
        'justify-start': isAssistant,
      })}
    >
      {/* Avatar */}
      {isAssistant && <MessageAvatar role={message.role} />}

      {/* Message bubble */}
      <div
        role="article"
        aria-label={STRINGS.a11y.messageFrom(roleLabel, timeLabel)}
        className={clsx('flex max-w-3xl flex-col gap-2 rounded-lg px-4 py-3', {
          // User bubble: slightly darker in dark mode for better separation from assistant
          'bg-blue-600 text-white dark:bg-blue-700': isUser,
          // Assistant bubble: increase contrast vs page (dark:bg-gray-900) by lightening slightly & add subtle border
          'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100 dark:border dark:border-gray-600 dark:shadow-none':
            isAssistant,
        })}
      >
        {/* Context truncation indicator */}
        {contextTruncated &&
          typeof messagesRemoved === 'number' &&
          messagesRemoved > 0 && (
            <ContextTruncationBanner messagesRemoved={messagesRemoved} />
          )}

        <div className="whitespace-pre-wrap break-words text-sm">
          {message.content}
          {isStreaming && (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current"></span>
          )}
        </div>

        <div
          className={clsx('flex items-center gap-2 text-xs', {
            'text-blue-100': isUser,
            'text-gray-500': isAssistant,
          })}
        >
          <span>{timeLabel}</span>
          <MessageStatusIcon status={message.status} />
          {isStreaming && (
            <span className="flex items-center gap-1">
              <LoadingDots />
              <span className="ml-1">{STRINGS.status.streaming}</span>
            </span>
          )}
          {message.metadata?.tokensUsed && !isStreaming && (
            <span className="ml-2">
              {STRINGS.metadata.tokens(message.metadata.tokensUsed)}
            </span>
          )}
        </div>
      </div>

      {/* User avatar */}
      {isUser && <MessageAvatar role={message.role} photoUrl={userPhotoUrl} />}
    </div>
  );
}
