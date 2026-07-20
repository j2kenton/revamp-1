/**
 * Cross-account REQUEST-level isolation regression test.
 *
 * `__tests__/app/chat/crossAccountIsolation.test.tsx` proves the UI/cache
 * guarantees (no stale render, cache purge, stream teardown) with
 * `useStreamingResponse` mocked. This file closes the remaining gap the
 * review identified: it uses the REAL `useStreamingResponse` hook (only
 * `global.fetch` is mocked) so it can inspect the actual outgoing
 * `/api/chat/stream` request and assert, at the network boundary, that
 * account B's bearer is never sent alongside account A's `chatId`.
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import ChatPage from '@/app/chat/page';
import { useAuth } from '@/lib/auth/useAuth';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/auth/csrf', () => ({
  deriveCsrfToken: jest.fn().mockResolvedValue('csrf-token'),
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

const authStateFor = (overrides: {
  authIdentityKey: string;
  accessToken: string;
  provider: 'microsoft' | 'google';
}) => ({
  status: 'authenticated' as const,
  isAuthenticated: true,
  provider: overrides.provider,
  authIdentityKey: overrides.authIdentityKey,
  login: jest.fn(),
  logout: jest.fn(),
  isLoading: false,
  user: { id: 'user', email: 'user@example.com', name: 'User' },
  error: null,
  accessToken: overrides.accessToken,
  acquireToken: jest.fn(),
  acquireGraphToken: jest.fn(),
  needsReauth: false,
  clearError: jest.fn(),
});

/** Encode SSE event blocks the same way the server's `/api/chat/stream` does. */
function encodeSseEvents(events: Array<{ event: string; data: unknown }>) {
  const encoder = new TextEncoder();
  const text = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
  return encoder.encode(text);
}

function makeStreamingResponse(chatId: string) {
  const chunk = encodeSseEvents([
    { event: 'message_created', data: { chatId, messageId: 'msg-1' } },
    {
      event: 'message_complete',
      data: { messageId: 'msg-1', content: 'hi', chatId },
    },
  ]);
  let delivered = false;
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read: async () => {
          if (!delivered) {
            delivered = true;
            return { done: false, value: chunk };
          }
          return { done: true, value: undefined };
        },
      }),
    },
  } as unknown as Response;
}

describe('Cross-account REQUEST-level isolation', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('never sends account B bearer with account A chatId, or vice versa', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // --- Account A sends a message, which creates chat "chat-a" ---
    mockUseAuth.mockReturnValue(
      authStateFor({
        authIdentityKey: 'microsoft:account-a',
        accessToken: 'token-a',
        provider: 'microsoft',
      }),
    );
    fetchMock.mockResolvedValueOnce(makeStreamingResponse('chat-a'));

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ChatPage />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Send Message' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(firstUrl).toBe('/api/chat/stream');
    expect((firstInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-a',
    );
    expect(JSON.parse(firstInit.body as string).chatId).toBeUndefined();

    // --- Explicit switch to account B (different authIdentityKey) ---
    mockUseAuth.mockReturnValue(
      authStateFor({
        authIdentityKey: 'google:account-b',
        accessToken: 'token-b',
        provider: 'google',
      }),
    );
    fetchMock.mockResolvedValueOnce(makeStreamingResponse('chat-b'));

    rerender(
      <QueryClientProvider client={queryClient}>
        <ChatPage />
      </QueryClientProvider>,
    );

    // `ChatPage` remounts `AuthenticatedChat` under `key={authIdentityKey}`,
    // so account B's chat starts with no `chatId` — account A's `chat-a`
    // must never be carried forward onto a request bearing B's token.
    await user.click(screen.getByRole('button', { name: 'Send Message' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [secondUrl, secondInit] = fetchMock.mock.calls[1];
    expect(secondUrl).toBe('/api/chat/stream');
    expect((secondInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-b',
    );
    const secondBody = JSON.parse(secondInit.body as string);
    expect(secondBody.chatId).toBeUndefined();
    expect(secondBody.chatId).not.toBe('chat-a');
  });
});
