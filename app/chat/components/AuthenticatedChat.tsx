/**
 * Authenticated Chat Shell
 * Chat interface shown once a user is signed in
 */

'use client';

import { useCallback, useState } from 'react';
import { STRINGS } from '@/lib/constants/strings';
import type { MessageDTO } from '@/types/models';
import { useAuth } from '@/lib/auth/useAuth';
import { useProfilePhoto } from '@/lib/auth/useProfilePhoto';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { MessageList } from './MessageList';
import { useStreamingResponse } from '../hooks/useStreamingResponse';

interface AuthenticatedChatProps {
  user: { id: string; email: string; name: string } | null;
  onLogout: () => void;
}

export function AuthenticatedChat({ user, onLogout }: AuthenticatedChatProps) {
  const [chatId, setChatId] = useState<string | undefined>();
  const { photoUrl } = useProfilePhoto();
  const { needsReauth, login } = useAuth();

  const handleReauth = () => {
    // `needsReauth` only ever arises from a suppressed/rejected Google
    // renewal (see GoogleAuthProvider) — an explicit re-login is the
    // guaranteed floor when the best-effort automatic renewal doesn't land.
    void login('google');
  };

  const handleMessageCreated = useCallback(
    (_messageId: string, serverChatId: string) => {
      if (!chatId && serverChatId) {
        setChatId(serverChatId);
      }
    },
    [chatId],
  );

  const handleStreamComplete = useCallback(
    (message: MessageDTO) => {
      if (!chatId && message.chatId) {
        setChatId(message.chatId);
      }
    },
    [chatId],
  );

  const {
    sendStreamingMessage,
    isStreaming,
    error: streamingError,
    closeConnection,
    rateLimitSeconds,
    liveMessages,
  } = useStreamingResponse({
    chatId,
    onMessageCreated: handleMessageCreated,
    onComplete: handleStreamComplete,
  });

  const handleSendMessage = (content: string) => {
    void sendStreamingMessage(content);
  };

  const handleNewChat = () => {
    closeConnection();
    setChatId(undefined);
  };

  return (
    <div className="flex h-dvh flex-col bg-[var(--background)] dark:bg-gray-900">
      <a href="#chat-main" className="skip-link">
        {STRINGS.chat.authPrompt.skipLink}
      </a>
      <ChatHeader user={user} photoUrl={photoUrl} onLogout={onLogout} />

      {needsReauth ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>{STRINGS.auth.reauthBanner}</span>
          <button
            type="button"
            onClick={handleReauth}
            className="inline-flex min-h-11 items-center rounded-md border border-amber-400 px-3 text-sm font-medium text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900"
          >
            {STRINGS.auth.reauthAction}
          </button>
        </div>
      ) : null}

      {/* Main chat area */}
      <ChatErrorBoundary onReset={handleNewChat}>
        <main id="chat-main" className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <MessageList
              chatId={chatId}
              liveMessages={liveMessages}
            />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 bg-[var(--background)] dark:border-gray-700 dark:bg-gray-900">
            <ChatInput
              onSendMessage={handleSendMessage}
              isStreaming={isStreaming}
              error={streamingError}
              rateLimitSeconds={rateLimitSeconds}
              onNewChat={handleNewChat}
            />
          </div>
        </main>
      </ChatErrorBoundary>
    </div>
  );
}
