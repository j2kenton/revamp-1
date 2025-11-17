/**
 * User-Facing Strings
 * Centralized translations and user-facing text
 * TODO: Replace with proper i18n solution when needed
 */

export const STRINGS = {
  // Chat Messages
  chat: {
    emptyState: {
      title: 'Start a conversation',
      description: 'Type a message below to begin chatting with AI',
    },
    loadingMessages: {
      ariaLabel: 'Loading messages',
    },
    errorState: {
      title: 'Failed to load messages',
    },
    noMessages: 'No messages yet. Start the conversation!',
    messageHistory: 'Chat message history',
  },

  // Message roles
  roles: {
    user: 'You',
    assistant: 'Assistant',
  },

  // Message status
  status: {
    sending: 'Sending',
    sent: 'Sent',
    failed: 'Failed',
    streaming: 'Streaming',
  },

  // Connection status
  connection: {
    online: 'Online',
    offline: 'Offline',
    reconnecting: 'Reconnecting...',
  },

  // Chat input
  input: {
    placeholder: 'Type your message... (Enter to send, Shift+Enter for new line)',
    sendButton: 'Send',
    characterCount: (current: number, max: number) => `${current} / ${max}`,
    ariaLabel: 'Message input',
    keyboardHints: {
      enter: 'Enter',
      shift: 'Shift',
      toSend: 'to send',
      forNewLine: 'for new line',
      separator: '•',
    },
  },

  // Validation errors
  validation: {
    messageRequired: 'Message is required.',
    messageTooLong: 'Message is too long.',
  },

  // Request errors
  errors: {
    sendFailed: 'Failed to send message. Please try again.',
    rateLimited: 'Too many requests. Please try again soon.',
    rateLimitCountdown: (seconds: number) =>
      `You are sending messages too quickly. Please try again in ${seconds}s.`,
    notAuthenticated: 'Not authenticated',
    authFailed: 'Failed to sign in. Please try again.',
  },

  // Actions
  actions: {
    retry: 'Retry',
    send: 'Send',
    signIn: 'Sign in',
    signOut: 'Sign out',
    goHome: 'Go Home',
  },

  // Theme
  theme: {
    selectLabel: 'Select theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    ariaLabel: 'Theme selector',
  },

  // Auth/Login
  auth: {
    signInTitle: 'Sign in to your account',
    signInDescription: 'Sign in with your Microsoft account',
    signInButton: 'Sign in with Microsoft',
    signingIn: 'Signing in...',
    disclaimer:
      'By signing in, you agree to use your organizational Microsoft account for authentication.',
  },

  // Dashboard
  dashboard: {
    title: 'Dashboard',
    userInfo: 'User Information',
    sessionStatus: 'Session Status',
    authenticated: '✓ Authenticated',
    successTitle: '🎉 NextAuth.js is working!',
    successDescription:
      'This is a protected route. You can only see this page when authenticated. Your session is managed securely with httpOnly cookies.',
    labels: {
      id: 'ID:',
      email: 'Email:',
      name: 'Name:',
    },
  },

  // Context truncation
  contextTruncation: {
    warning: 'Context truncated warning',
    message: (count: number) =>
      `Context truncated: ${count} older message${count > 1 ? 's' : ''} removed to fit context window`,
  },

  // Metadata
  metadata: {
    tokens: (count: number) => `${count} tokens`,
  },

  // Accessibility
  a11y: {
    chatInterface: 'Chat interface',
    chatMessages: 'Chat messages',
    messageFrom: (role: string, time: string) => `${role}, ${time}`,
  },
} as const;
