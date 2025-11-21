/**
 * Chat Page
 * Main chat interface for AI conversations
 */

'use client';

import { useState } from 'react';
import { STRINGS } from '@/lib/constants/strings';
import type { MessageDTO } from '@/types/models';
import { useAuth } from '@/lib/auth/useAuth';
import { useProfilePhoto } from '@/lib/auth/useProfilePhoto';
import { ChatHeader } from './components/ChatHeader';
import { ChatInput } from './components/ChatInput';
import { ChatErrorBoundary } from './components/ChatErrorBoundary';
import { ChatSignInPrompt } from './components/ChatSignInPrompt';
import { MessageList } from './components/MessageList';
import { useStreamingResponse } from './hooks/useStreamingResponse';

export default function ChatPage() {
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const {
    isAuthenticated,
    login,
    logout,
    isLoading: isAuthLoading,
    user,
    error: authError,
  } = useAuth();
  const { photoUrl } = useProfilePhoto();

  const {
    sendStreamingMessage,
    isStreaming,
    error: streamingError,
    closeConnection,
    rateLimitSeconds,
    liveMessages,
  } = useStreamingResponse({
    chatId,
    onMessageCreated: (_messageId, serverChatId) => {
      if (!chatId && serverChatId) {
        setChatId(serverChatId);
      }
    },
    onComplete: (message: MessageDTO) => {
      if (!chatId && message.chatId) {
        setChatId(message.chatId);
      }
    },
  });

  const handleSendMessage = (content: string) => {
    void sendStreamingMessage(content);
  };

  const handleNewChat = () => {
    closeConnection();
    setChatId(undefined);
  };

  if (!isAuthenticated) {
    return (
      <ChatSignInPrompt
        onLogin={() => void login()}
        isLoading={isAuthLoading}
        errorMessage={authError?.message}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--background)] dark:bg-gray-900">
      <a href="#chat-main" className="skip-link">
        {STRINGS.chat.authPrompt.skipLink}
      </a>
      <ChatHeader user={user} photoUrl={photoUrl} onLogout={() => void logout()} />

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
