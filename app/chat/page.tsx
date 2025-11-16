/**
 * Chat Page
 * Main chat interface for AI conversations
 */

'use client';

import { useState } from 'react';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ChatErrorBoundary } from './components/ChatErrorBoundary';
import { useStreamingResponse } from './hooks/useStreamingResponse';
import type { MessageDTO } from '@/types/models';

export default function ChatPage() {
  const [chatId, setChatId] = useState<string | null>(null);

  const {
    sendStreamingMessage,
    streamingMessage,
    isStreaming,
    error: streamingError,
    closeConnection,
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

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <a href="#chat-main" className="skip-link">
        Skip to chat content
      </a>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">AI Chat</h1>
          <ConnectionStatus />
        </div>
        <div className="flex items-center gap-2">
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
          <div className="border-t border-gray-200 bg-white">
            <ChatInput
              onSendMessage={handleSendMessage}
              isStreaming={isStreaming}
              error={streamingError}
            />
          </div>
        </main>
      </ChatErrorBoundary>
    </div>
  );
}
