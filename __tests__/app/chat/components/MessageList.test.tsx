import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageList } from '@/app/chat/components/MessageList';
import { STRINGS } from '@/lib/constants/strings';
import type { MessageDTO } from '@/types/models';
import { useFetchChatHistory } from '@/app/chat/hooks/useFetchChatHistory';

jest.mock('@/app/chat/hooks/useFetchChatHistory', () => ({
  useFetchChatHistory: jest.fn(),
}));

// MessageList reads the signed-in user's photo via `useProfilePhoto`, which
// is a thin `useAuth()` consumer requiring an `<AuthProvider>` ancestor in
// the real app. This suite only exercises message rendering, not identity or
// photo behavior (see `__tests__/lib/auth/useProfilePhoto.test.ts` for that),
// so the hook is mocked directly rather than standing up the full provider
// tree here.
jest.mock('@/lib/auth/useProfilePhoto', () => ({
  useProfilePhoto: jest.fn(() => ({ photoUrl: null })),
}));

jest.mock('@tanstack/react-virtual', () => {
  return {
    useVirtualizer: jest.fn((config: { count: number }) => {
      const items = Array.from({ length: config.count }, (_, index) => ({
        key: `virtual-${index}`,
        index,
        start: index * 24,
      }));

      return {
        getTotalSize: () => items.length * 24,
        getVirtualItems: () => items,
        measureElement: jest.fn(),
        scrollToIndex: jest.fn(),
      };
    }),
  };
});

const mockUseFetchChatHistory =
  useFetchChatHistory as jest.MockedFunction<typeof useFetchChatHistory>;

const createHookResult = (
  overrides: Partial<ReturnType<typeof useFetchChatHistory>> = {},
) => ({
  chat: undefined,
  pagination: undefined,
  messages: [] as MessageDTO[],
  isLoading: false,
  error: null,
  refetch: jest.fn(),
  ...overrides,
});

const buildMessage = (overrides: Partial<MessageDTO> = {}): MessageDTO => {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? `msg-${Math.random()}`,
    chatId: overrides.chatId ?? 'chat-123',
    role: overrides.role ?? 'user',
    content: overrides.content ?? 'Hello world',
    status: overrides.status ?? 'sent',
    parentMessageId: overrides.parentMessageId ?? null,
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
};

describe('MessageList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFetchChatHistory.mockReturnValue(createHookResult());
  });

  it('renders onboarding state when no chat is selected', () => {
    render(<MessageList />);

    expect(
      screen.getByRole('heading', { name: STRINGS.chat.emptyState.title }),
    ).toBeInTheDocument();
  });

  it('shows loading skeletons while fetching history', () => {
    mockUseFetchChatHistory.mockReturnValue(
      createHookResult({ isLoading: true }),
    );

    render(<MessageList chatId="chat-123" />);

    expect(
      screen.getAllByRole('status', { name: /loading message/i }).length,
    ).toBeGreaterThan(0);
  });

  it('renders error fallback when history fails to load', () => {
    const error = new Error('Unable to load');
    mockUseFetchChatHistory.mockReturnValue(createHookResult({ error }));

    render(<MessageList chatId="chat-123" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(error.message)).toBeInTheDocument();
  });

  it('renders messages returned from the hook', () => {
    mockUseFetchChatHistory.mockReturnValue(
      createHookResult({
        messages: [
          buildMessage({ id: '1', role: 'user', content: 'Hello' }),
          buildMessage({ id: '2', role: 'assistant', content: 'Hi there!' }),
        ],
      }),
    );

    render(<MessageList chatId="chat-123" />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('renders the optimistic echo before a chatId exists', () => {
    // On a brand-new conversation the server hasn't assigned a chatId yet,
    // so the history query is disabled — the echo in liveMessages must win
    // over the "no chat" onboarding state.
    render(
      <MessageList
        liveMessages={[
          buildMessage({
            id: 'temp_abc',
            chatId: '',
            content: 'First message, optimistically',
            status: 'sending',
          }),
        ]}
      />,
    );

    expect(
      screen.getByText('First message, optimistically'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: STRINGS.chat.emptyState.title }),
    ).not.toBeInTheDocument();
  });

  it('appends live messages when provided', () => {
    mockUseFetchChatHistory.mockReturnValue(createHookResult());

    render(
      <MessageList
        chatId="chat-123"
        liveMessages={[
          buildMessage({
            id: 'stream-1',
            content: 'Typing...',
            role: 'assistant',
            status: 'sending',
          }),
        ]}
      />,
    );

    expect(screen.getByText('Typing...')).toBeInTheDocument();
  });
});
