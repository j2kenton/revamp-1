/**
 * Authenticated Chat Shell
 * Chat interface shown once a user is signed in
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { STRINGS } from '@/lib/constants/strings';
import type { MessageDTO } from '@/types/models';
import { useAuth } from '@/lib/auth/useAuth';
import { useProfilePhoto } from '@/lib/auth/useProfilePhoto';
import { SkipLink } from '@/components/SkipLink';
import { chatListQueryKey } from '../utils/chatQueryKey';
import { ChatHeader } from './ChatHeader';
import { ChatMain } from './ChatMain';
import { ChatSidebar } from './ChatSidebar';
import { ReauthBanner } from './ReauthBanner';
import { useStreamingResponse } from '../hooks/useStreamingResponse';

interface AuthenticatedChatProps {
  user: { id: string; email: string; name: string } | null;
  initialChatId?: string;
  onLogout: () => void;
}

export function AuthenticatedChat({
  user,
  initialChatId,
  onLogout,
}: AuthenticatedChatProps) {
  // Local state stays the source of truth for the in-flight stream; the
  // `/chat/[chatId]` route only seeds it so a reload lands back in the same
  // conversation.
  const [chatId, setChatId] = useState<string | undefined>(initialChatId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { photoUrl } = useProfilePhoto();
  const { needsReauth, login, authIdentityKey } = useAuth();

  const handleReauth = () => {
    // `needsReauth` only ever arises from a suppressed/rejected Google
    // renewal (see GoogleAuthProvider) — an explicit re-login is the
    // guaranteed floor when the best-effort automatic renewal doesn't land.
    void login('google');
  };

  const invalidateChatList = () => {
    queryClient.invalidateQueries({
      queryKey: chatListQueryKey(authIdentityKey),
    });
  };

  // Adopt the server-assigned chat ID for a brand-new conversation. URL sync
  // uses history.replaceState, NOT router.replace(): a router navigation
  // would remount the segment (ChatPageShell keys AuthenticatedChat by
  // initialChatId) and kill the open SSE connection mid-stream.
  const adoptServerChatId = (serverChatId: string) => {
    setChatId(serverChatId);
    window.history.replaceState(null, '', `/chat/${serverChatId}`);
  };

  const handleMessageCreated = (_messageId: string, serverChatId: string) => {
    if (!chatId && serverChatId) {
      adoptServerChatId(serverChatId);
    }
    invalidateChatList();
  };

  const handleStreamComplete = (message: MessageDTO) => {
    if (!chatId && message.chatId) {
      adoptServerChatId(message.chatId);
    }
    invalidateChatList();
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
    router.push('/chat');
  };

  const handleSelectChat = (nextChatId: string) => {
    if (nextChatId === chatId) {
      return;
    }
    closeConnection();
    router.push(`/chat/${nextChatId}`);
  };

  return (
    <div className="flex h-dvh flex-col bg-[var(--background)] dark:bg-gray-900">
      <SkipLink targetId="chat-main">
        {STRINGS.chat.authPrompt.skipLink}
      </SkipLink>
      <ChatHeader user={user} photoUrl={photoUrl} onLogout={onLogout} />

      {needsReauth ? <ReauthBanner onReauth={handleReauth} /> : null}

      <div className="flex flex-1 overflow-hidden">
        <ChatSidebar
          activeChatId={chatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
        />
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
    </div>
  );
}
