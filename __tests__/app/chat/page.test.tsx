import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import ChatPage from '@/app/chat/page';
import { useAuth } from '@/lib/auth/useAuth';
import { useStreamingResponse } from '@/app/chat/hooks/useStreamingResponse';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/app/chat/hooks/useStreamingResponse', () => ({
  useStreamingResponse: jest.fn(),
}));

jest.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

jest.mock('@/app/chat/components/MessageList', () => ({
  MessageList: () => <div data-testid="message-list">messages</div>,
}));

jest.mock('@/app/chat/components/ChatInput', () => ({
  ChatInput: ({
    onSendMessage,
  }: {
    onSendMessage: (value: string) => void;
  }) => (
    <button type="button" onClick={() => onSendMessage('hello')}>
      Send Message
    </button>
  ),
}));

jest.mock('@/app/chat/components/ConnectionStatus', () => ({
  ConnectionStatus: () => <div data-testid="connection-status">online</div>,
}));

jest.mock('@/app/chat/components/ChatErrorBoundary', () => ({
  ChatErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseStreamingResponse = useStreamingResponse as jest.MockedFunction<
  typeof useStreamingResponse
>;
const mockPush = jest.fn();

const baseAuthState = {
  status: 'authenticated' as const,
  isAuthenticated: true,
  provider: 'microsoft' as const,
  authIdentityKey: 'microsoft:test-home-account',
  login: jest.fn(),
  logout: jest.fn(),
  isLoading: false,
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  error: null,
  accessToken: null,
  acquireToken: jest.fn(),
  acquireGraphToken: jest.fn(),
  needsReauth: false,
  clearError: jest.fn(),
};

const baseStreamingState = {
  sendStreamingMessage: jest.fn(),
  isStreaming: false,
  error: null,
  closeConnection: jest.fn(),
  rateLimitSeconds: 0,
  contextTruncated: false,
  messagesRemoved: 0,
  liveMessages: [],
  streamingMessage: null,
};

describe('ChatPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStreamingResponse.mockReturnValue(baseStreamingState);
    mockUseRouter.mockReturnValue({
      push: mockPush,
    } as unknown as ReturnType<typeof useRouter>);
  });

  it('renders sign-in prompt when the user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      status: 'unauthenticated',
      isAuthenticated: false,
      provider: null,
      authIdentityKey: null,
    });

    render(<ChatPage />);

    expect(
      screen.getByRole('heading', { name: /sign in to start chatting/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in with microsoft/i }),
    ).toBeInTheDocument();
  });

  it('renders chat interface when authenticated', () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      isAuthenticated: true,
    });

    render(<ChatPage />);

    expect(screen.getByText(/Gemini 3/)).toBeInTheDocument();
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /start new chat/i }),
    ).toBeInTheDocument();
  });

  it('shows a loading treatment instead of an interactive sign-in surface while resolving', () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      status: 'resolving',
      isAuthenticated: false,
      provider: null,
      authIdentityKey: null,
    });

    render(<ChatPage />);

    // No live Google button/iframe may mount while the auth state machine
    // hasn't resolved (rule 0) — only the inert skeleton placeholder.
    expect(
      screen.queryByTestId('google-signin-button'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('google-signin-placeholder'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in with microsoft/i }),
    ).toBeDisabled();
  });

  it('navigates back to the landing page after a Google sign-out', async () => {
    const user = userEvent.setup();
    const mockLogout = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      provider: 'google',
      authIdentityKey: 'google:sub-1',
      logout: mockLogout,
    });

    render(<ChatPage />);

    await user.click(screen.getByRole('button', { name: /open user menu/i }));
    await user.click(await screen.findByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('navigates back to the landing page after a Microsoft sign-out', async () => {
    // `logoutPopup` redirects only its own popup window, so the main tab needs
    // this explicit navigation to reach the landing page — same as Google.
    const user = userEvent.setup();
    const mockLogout = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      provider: 'microsoft',
      logout: mockLogout,
    });

    render(<ChatPage />);

    await user.click(screen.getByRole('button', { name: /open user menu/i }));
    await user.click(await screen.findByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });
});
