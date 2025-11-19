/**
 * Chat Page
 * Main chat interface for AI conversations
 */

'use client';

import { useState } from 'react';
import type { MessageDTO } from '@/types/models';
import { useAuth } from '@/lib/auth/useAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ChatErrorBoundary } from './components/ChatErrorBoundary';
import { useStreamingResponse } from './hooks/useStreamingResponse';

export default function ChatPage() {
  const [chatId, setChatId] = useState<string | null>(null);
  const {
    isAuthenticated,
    login,
    isLoading: isAuthLoading,
    user,
    error: authError,
  } = useAuth();

  const {
    sendStreamingMessage,
    streamingMessage,
    isStreaming,
    error: streamingError,
    closeConnection,
    rateLimitSeconds,
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
    setChatId(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow">
          <h1 className="text-2xl font-bold text-gray-900">
            Sign in to start chatting
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Connect with your Microsoft account to continue. Your identity is
            required for secure chat history and rate limiting.
          </p>
          {authError && (
            <p
              className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {authError.message}
            </p>
          )}
          <button
            onClick={() => void login()}
            disabled={isAuthLoading}
            className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAuthLoading ? 'Signing in...' : 'Sign in with Microsoft'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      <a href="#chat-main" className="skip-link">
        Skip to chat content
      </a>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
            Gemini 3
          </h1>
          <ConnectionStatus />
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={handleNewChat}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            New Chat
          </button>
        </div>
      </header>

      {/* Main chat area */}
      <ChatErrorBoundary onReset={handleNewChat}>
        <main id="chat-main" className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <MessageList chatId={chatId} streamingMessage={streamingMessage} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <ChatInput
              onSendMessage={handleSendMessage}
              isStreaming={isStreaming}
              error={streamingError}
              rateLimitSeconds={rateLimitSeconds}
              userDisplayName={user?.name ?? user?.email ?? undefined}
            />
          </div>
        </main>
      </ChatErrorBoundary>
    </div>
  );
}
