/**
 * Chat Page
 * Main chat interface for AI conversations
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { STRINGS } from '@/lib/constants/strings';
import type { MessageDTO } from '@/types/models';
import { useAuth } from '@/lib/auth/useAuth';
import { useProfilePhoto } from '@/lib/auth/useProfilePhoto';
import type { AuthProviderId } from '@/lib/auth/authProviderMarker';
import { ChatHeader } from './components/ChatHeader';
import { ChatInput } from './components/ChatInput';
import { ChatErrorBoundary } from './components/ChatErrorBoundary';
import { ChatSignInPrompt } from './components/ChatSignInPrompt';
import { MessageList } from './components/MessageList';
import { useStreamingResponse } from './hooks/useStreamingResponse';

interface AuthenticatedChatProps {
  user: { id: string; email: string; name: string } | null;
  onLogout: () => void;
}

function AuthenticatedChat({ user, onLogout }: AuthenticatedChatProps) {
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const { photoUrl } = useProfilePhoto();
  const { needsReauth, login } = useAuth();

  const handleReauth = () => {
    // `needsReauth` only ever arises from a suppressed/rejected Google
    // renewal (see GoogleAuthProvider) — an explicit re-login is the
    // guaranteed floor when the best-effort automatic renewal doesn't land.
    void login('google');
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

  return (
    <div className="flex h-dvh flex-col bg-[var(--background)] dark:bg-gray-900">
      <a href="#chat-main" className="skip-link">
        {STRINGS.chat.authPrompt.skipLink}
      </a>
      <ChatHeader user={user} photoUrl={photoUrl} onLogout={onLogout} />

      {needsReauth && (
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
      )}

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

export default function ChatPage() {
  const router = useRouter();
  const {
    isAuthenticated,
    status,
    login,
    logout,
    isLoading: isAuthLoading,
    user,
    authIdentityKey,
    error: authError,
    clearError,
  } = useAuth();

  const handleLogin = (targetProvider: AuthProviderId) => {
    void login(targetProvider);
  };

  const handleLogout = async () => {
    // Navigate explicitly for both providers so sign-out lands on the landing
    // page regardless of which one was active. Neither IdP does this for us:
    // Google has no redirect of its own, and Microsoft's `logoutPopup` only
    // ever redirects its own popup window (that call's `postLogoutRedirectUri`
    // governs the popup, not this tab), which would otherwise strand the user
    // on the chat route looking at the sign-in gate.
    await logout();
    router.push('/');
  };

  if (!isAuthenticated) {
    return (
      <ChatSignInPrompt
        onLogin={handleLogin}
        isLoading={isAuthLoading}
        isResolving={status === 'resolving'}
        errorMessage={authError?.message}
        onDismissError={clearError}
      />
    );
  }

  // Remounting on identity change guarantees no leftover chat state
  // (messages, in-flight streams) survives a switch between accounts.
  return (
    <AuthenticatedChat
      key={authIdentityKey}
      user={user}
      onLogout={() => void handleLogout()}
    />
  );
}
