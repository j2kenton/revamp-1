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
    authPrompt: {
      title: 'Sign in to start chatting',
      description:
        'Connect with your Microsoft account to continue. Your identity is required for secure chat history and rate limiting.',
      skipLink: 'Skip to chat content',
    },
    header: {
      brandLead: 'Introducing:',
      productName: 'Gemini 3',
      logoAlt: 'Gemini 3 logo',
      userMenuAriaLabel: 'Open user menu',
    },
    clear: 'Clear',
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
    loading: 'Loading...',
  },

  // Connection status
  connection: {
    online: 'Online',
    offline: 'Offline',
    reconnecting: 'Reconnecting...',
  },

  // Chat input
  input: {
    placeholder: `Type your message...
      
(Enter to send, Shift+Enter for new line)
`,
    sendButton: 'Send',
    sendButtonAria: 'Send message',
    characterCount: (current: number, max: number) =>
      `Characters: ${current} / ${max}`,
    ariaLabel: 'Message input',
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
    streamingStartFailed: 'Failed to start streaming.',
    streamingGeneric: 'Streaming error',
    emptyResponse: 'Empty response received from server.',
    unexpected: 'An unexpected error occurred. Please try again.',
    chatHistoryFailed: 'Failed to fetch chat history',
  },

  // Actions
  actions: {
    retry: 'Retry',
    retryChat: 'Retry chat',
    send: 'Send',
    signIn: 'Sign in',
    signOut: 'Sign out',
    goHome: 'Go Home',
    reload: 'Reload page',
    returnToLogin: 'Return to login',
    clear: 'Clear',
    tryAgain: 'Try again',
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

  // Streaming
  streaming: {
    fallbackTitle: 'Circuit breaker message',
    tooManyRequests: 'Too many requests',
    notAuthenticated: 'Not authenticated',
    testIntro: (content: string) => `Thanks for your message: "${content}".`,
    testChunk: 'This automated test response simulates streaming output.',
  },

  // Error boundaries and pages
  errorsUi: {
    chatBoundaryTitle: 'We hit a snag',
    chatBoundaryDescription:
      'An unexpected error occurred while loading the chat experience.',
    appBoundaryTitle: 'Something went wrong!',
    appBoundaryDescription: 'An unexpected error occurred. Please try again.',
  },

  // Test support login
  testSupport: {
    disabledTitle: 'Test login disabled',
    disabledDescription:
      'Enable TEST_AUTH_MODE to access the automated test login page.',
    disabledError: 'Test authentication mode is disabled.',
    title: 'Sign in as Test User',
    subtitle: 'Test Support',
    description:
      'This helper page configures the application for automated end-to-end tests.',
    configuring: 'Configuring test session…',
    continueCta: 'Continue to chat',
    helperText:
      'A temporary cookie and local flag are stored to bypass MSAL login during the test session.',
  },
} as const;
