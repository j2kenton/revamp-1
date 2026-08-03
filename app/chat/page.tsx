/**
 * Chat Page
 * Main chat interface for AI conversations
 */

'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import type { AuthProviderId } from '@/lib/auth/authProviderMarker';
import { ChatSignInPrompt } from './components/ChatSignInPrompt';
import { AuthenticatedChat } from './components/AuthenticatedChat';

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
