/**
 * Authenticated Chat Shell
 * Chat interface shown once a user is signed in
 */

'use client';

import { useState } from 'react';
import { STRINGS } from '@/lib/constants/strings';
import type { MessageDTO } from '@/types/models';
import { useAuth } from '@/lib/auth/useAuth';
import { useProfilePhoto } from '@/lib/auth/useProfilePhoto';
import { SkipLink } from '@/components/SkipLink';
import { ChatHeader } from './ChatHeader';
import { ChatMain } from './ChatMain';
import { ReauthBanner } from './ReauthBanner';
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

  const handleMessageCreated = (_messageId: string, serverChatId: string) => {
    if (!chatId && serverChatId) {
      setChatId(serverChatId);
    }
  };

  const handleStreamComplete = (message: MessageDTO) => {
    if (!chatId && message.chatId) {
      setChatId(message.chatId);
    }
  };

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
      <SkipLink targetId="chat-main">
        {STRINGS.chat.authPrompt.skipLink}
      </SkipLink>
      <ChatHeader user={user} photoUrl={photoUrl} onLogout={onLogout} />

      {needsReauth ? <ReauthBanner onReauth={handleReauth} /> : null}

      <ChatMain
        chatId={chatId}
        liveMessages={liveMessages}
        onSendMessage={handleSendMessage}
        isStreaming={isStreaming}
        error={streamingError}
        rateLimitSeconds={rateLimitSeconds}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
