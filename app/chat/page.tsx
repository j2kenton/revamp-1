/**
 * Chat Page
 * Main chat interface for AI conversations
 */

'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { MessageDTO } from '@/types/models';
import { useAuth } from '@/lib/auth/useAuth';
import { useProfilePhoto } from '@/lib/auth/useProfilePhoto';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
    setChatId(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-6">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
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
            className="mt-6 w-full cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAuthLoading ? 'Signing in...' : 'Sign in with Microsoft'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--background)] dark:bg-gray-900">
      <a href="#chat-main" className="skip-link">
        Skip to chat content
      </a>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-[var(--background)] px-6 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <h1 className="flex items-center gap-2 pr-1 text-4xl font-bold text-gray-900 dark:text-gray-100">
            <span>Introducing:</span>
            <Image
              src="/gemini-style-logo.png"
              alt="Gemini 3 logo"
              width={40}
              height={40}
              priority
              className="h-10 w-10"
            />
            <span>Gemini 3</span>
          </h1>
          <ConnectionStatus />
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-auto rounded-full p-0 hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  aria-label="Open user menu"
                >
                  {photoUrl ? (
                    <Image
                      src={photoUrl}
                      alt="Profile"
                      width={32}
                      height={32}
                      className="rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 text-xs font-medium text-gray-600 dark:bg-gray-600 dark:text-gray-300">
                      {(user.name ?? user.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    {photoUrl ? (
                      <Image
                        src={photoUrl}
                        alt="Profile"
                        width={40}
                        height={40}
                        className="rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300 text-sm font-medium text-gray-600 dark:bg-gray-600 dark:text-gray-300">
                        {(user.name ?? user.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {user.name ?? user.email}
                      </span>
                      {user.name && user.email && (
                        <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {user.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
                      onClick={() => void logout()}
                    >
                      Sign out
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </header>

      {/* Main chat area */}
      <ChatErrorBoundary onReset={handleNewChat}>
        <main id="chat-main" className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <MessageList
              chatId={chatId ?? undefined}
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
