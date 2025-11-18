import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import ChatPage from '@/app/chat/page';
import { useAuth } from '@/lib/auth/useAuth';
import { useStreamingResponse } from '@/app/chat/hooks/useStreamingResponse';

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
  ChatInput: ({ onSendMessage }: { onSendMessage: (value: string) => void }) => (
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
const mockUseStreamingResponse = useStreamingResponse as jest.MockedFunction<
  typeof useStreamingResponse
>;

const baseAuthState = {
  isAuthenticated: true,
  login: jest.fn(),
  logout: jest.fn(),
  isLoading: false,
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  error: null,
  accessToken: null,
  acquireToken: jest.fn(),
};

const baseStreamingState = {
  sendStreamingMessage: jest.fn(),
  streamingMessage: null,
  isStreaming: false,
  error: null,
  closeConnection: jest.fn(),
  rateLimitSeconds: 0,
  contextTruncated: false,
  messagesRemoved: 0,
};

describe('ChatPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStreamingResponse.mockReturnValue(baseStreamingState);
  });

  it('renders sign-in prompt when the user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      isAuthenticated: false,
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

    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });
});
