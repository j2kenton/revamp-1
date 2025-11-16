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

export default function ChatPage() {
  const [chatId, setChatId] = useState<string | null>(null);

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
            onClick={() => setChatId(null)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            New Chat
          </button>
        </div>
      </header>

      {/* Main chat area */}
      <ChatErrorBoundary onReset={() => setChatId(null)}>
        <main id="chat-main" className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <MessageList chatId={chatId} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 bg-white">
            <ChatInput chatId={chatId} onChatCreated={setChatId} />
          </div>
        </main>
      </ChatErrorBoundary>
    </div>
  );
}
