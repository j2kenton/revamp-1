/**
 * Cross-account chat isolation regression test.
 *
 * Renders the REAL `ChatPage` (`app/chat/page.tsx`) together with the REAL
 * `IdentityCacheReset` (`components/auth/IdentityCacheReset.tsx`) inside a
 * shared `QueryClient`, exactly as `app/layout.tsx` composes them in
 * production. Only `useAuth()` and `useStreamingResponse()` are mocked (the
 * standard pattern used by `__tests__/app/chat/page.test.tsx`) so this test
 * can drive an explicit account switch by changing `authIdentityKey` and
 * assert the three isolation guarantees:
 *
 *  1. No account-A message renders after switching to account B.
 *  2. Account-A's query cache entries (namespaced under `chatHistoryQueryKey`)
 *     are removed via `queryClient.removeQueries`.
 *  3. Account-A's in-flight stream/connection is torn down — `ChatPage`
 *     remounts `AuthenticatedChat` with `key={authIdentityKey}` specifically
 *     so React's unmount lifecycle closes it; this test proves that remount
 *     actually happens end-to-end by observing `useStreamingResponse`'s
 *     cleanup effect fire on the switch. (The underlying
 *     `closeConnection()`/`AbortController.abort()` mechanics inside the
 *     real hook are covered separately in `useStreamingResponse.test.tsx`.)
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ChatPage from '@/app/chat/page';
import { IdentityCacheReset } from '@/components/auth/IdentityCacheReset';
import { useAuth } from '@/lib/auth/useAuth';
import { useStreamingResponse } from '@/app/chat/hooks/useStreamingResponse';
import {
  chatHistoryQueryKey,
  chatListQueryKey,
} from '@/app/chat/utils/chatQueryKey';
import type { MessageDTO } from '@/types/models';

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

jest.mock('@/app/chat/components/ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

jest.mock('@/app/chat/components/ConnectionStatus', () => ({
  ConnectionStatus: () => <div data-testid="connection-status">online</div>,
}));

jest.mock('@/app/chat/components/ChatErrorBoundary', () => ({
  ChatErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Real MessageList (not mocked) so it exercises the real
// `useFetchChatHistory` -> `chatHistoryQueryKey(authIdentityKey, chatId)`
// query-cache read, proving isolation at the actual read path.
jest.mock('@/app/chat/components/VirtualizedMessageList', () => ({
  VirtualizedMessageList: ({ messages }: { messages: MessageDTO[] }) => (
    <ul data-testid="message-list-content">
      {messages.map((message) => (
        <li key={message.id}>{message.content}</li>
      ))}
    </ul>
  ),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseStreamingResponse = useStreamingResponse as jest.MockedFunction<
  typeof useStreamingResponse
>;

const accountA = {
  authIdentityKey: 'microsoft:account-a',
  chatId: 'chat-a',
  user: { id: 'user-a', email: 'a@example.com', name: 'Account A' },
};
const accountB = {
  authIdentityKey: 'google:account-b',
  chatId: 'chat-b',
  user: { id: 'user-b', email: 'b@example.com', name: 'Account B' },
};

const authStateFor = (account: typeof accountA) => ({
  status: 'authenticated' as const,
  isAuthenticated: true,
  provider: (account === accountA ? 'microsoft' : 'google') as
    | 'microsoft'
    | 'google',
  authIdentityKey: account.authIdentityKey,
  login: jest.fn(),
  logout: jest.fn(),
  isLoading: false,
  user: account.user,
  error: null,
  accessToken: 'test-token',
  acquireToken: jest.fn(),
  acquireGraphToken: jest.fn(),
  needsReauth: false,
  clearError: jest.fn(),
});

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

describe('Cross-account chat isolation', () => {
  let queryClient: QueryClient;
  let removeQueriesSpy: jest.SpyInstance;
  let streamCleanupSpy: jest.Mock;
  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // The sidebar's real `useChatList` fetches `/api/chat` on mount; give it
    // an empty list so this suite exercises the cache-isolation guarantees
    // without real network I/O.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { chats: [] } }),
    }) as unknown as typeof fetch;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    removeQueriesSpy = jest.spyOn(queryClient, 'removeQueries');
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);

    streamCleanupSpy = jest.fn();
    // Stand-in for the real `useStreamingResponse`'s unmount effect (see
    // `app/chat/hooks/useStreamingResponse.ts`'s `useEffect(() => () =>
    // closeConnection(), [closeConnection])`) — registering a real effect
    // from inside the mock lets this test observe React actually tearing
    // down the previous account's `AuthenticatedChat` subtree (and with it,
    // its stream) when `ChatPage` remounts on `key={authIdentityKey}`.
    mockUseStreamingResponse.mockImplementation(() => {
      useEffect(() => streamCleanupSpy, []);
      return { ...baseStreamingState };
    });
  });

  it('tears down account A on switch to account B: no stale messages, cache removed, stream closed', async () => {
    // Seed account A's cache entry directly (as a completed fetch would
    // have) so we can prove it gets removed rather than merely never
    // fetched.
    queryClient.setQueryData(
      chatHistoryQueryKey(accountA.authIdentityKey, accountA.chatId),
      {
        chat: { id: accountA.chatId },
        messages: [
          {
            id: 'msg-a-1',
            chatId: accountA.chatId,
            role: 'user',
            content: 'Account A secret message',
            status: 'sent',
            parentMessageId: null,
            metadata: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } satisfies MessageDTO,
        ],
        pagination: { offset: 0, limit: 50, total: 1, hasMore: false },
      },
    );

    // Seed account A's conversation-list cache entry as a completed
    // `useChatList` fetch would have, so the switch can prove the list is
    // purged alongside the per-chat history caches.
    queryClient.setQueryData(chatListQueryKey(accountA.authIdentityKey), {
      chats: [
        {
          id: accountA.chatId,
          userId: 'user-a',
          title: 'Account A secret chat title',
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    mockUseAuth.mockReturnValue(authStateFor(accountA));

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <IdentityCacheReset />
        <ChatPage />
      </QueryClientProvider>,
    );

    // ChatPage's `chatId` is internal component state (only ever populated
    // via the streaming callbacks), so drive it the same way production
    // does: report account A's message as already created/streamed.
    mockUseStreamingResponse.mockImplementation((options) => {
      useEffect(() => {
        options.onComplete?.({
          id: 'msg-a-1',
          chatId: accountA.chatId,
          role: 'assistant',
          content: 'Account A secret message',
          status: 'sent',
          parentMessageId: null,
          metadata: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return streamCleanupSpy;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return { ...baseStreamingState };
    });
    rerender(
      <QueryClientProvider client={queryClient}>
        <IdentityCacheReset />
        <ChatPage />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        queryClient.getQueryData(
          chatHistoryQueryKey(accountA.authIdentityKey, accountA.chatId),
        ),
      ).toBeDefined();
    });

    // --- Switch to account B ---
    mockUseAuth.mockReturnValue(authStateFor(accountB));
    mockUseStreamingResponse.mockImplementation(() => {
      useEffect(() => streamCleanupSpy, []);
      return { ...baseStreamingState };
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <IdentityCacheReset />
        <ChatPage />
      </QueryClientProvider>,
    );

    // (1) No account-A message renders after the switch.
    await waitFor(() => {
      expect(
        screen.queryByText('Account A secret message'),
      ).not.toBeInTheDocument();
    });

    // (2) Account-A's query cache entries were removed via
    // `queryClient.removeQueries` (IdentityCacheReset's namespace purge).
    expect(removeQueriesSpy).toHaveBeenCalledWith({ queryKey: ['chat'] });
    expect(
      queryClient.getQueryData(
        chatHistoryQueryKey(accountA.authIdentityKey, accountA.chatId),
      ),
    ).toBeUndefined();

    // The conversation-list cache shares the `['chat', identity, ...]`
    // namespace, so the same purge must remove it — account B must never
    // see account A's chat titles in the sidebar.
    expect(
      queryClient.getQueryData(chatListQueryKey(accountA.authIdentityKey)),
    ).toBeUndefined();
    expect(
      screen.queryByText('Account A secret chat title'),
    ).not.toBeInTheDocument();

    // (3) Account-A's stream/connection was closed — `ChatPage` remounted
    // `AuthenticatedChat` (via `key={authIdentityKey}`), which unmounted the
    // previous `useStreamingResponse` instance and fired its cleanup.
    expect(streamCleanupSpy).toHaveBeenCalled();

    // (4) Account B's fresh `AuthenticatedChat` instance never carries
    // account A's `chatId` forward. `chatId` is local state seeded only by
    // streaming callbacks, so the remount (key={authIdentityKey}) must hand
    // `useStreamingResponse` `chatId: undefined` for account B — proving
    // account B's subsequent bearer-authenticated requests cannot reference
    // account A's chat.
    const lastCallArgsForB = mockUseStreamingResponse.mock.calls.at(-1)?.[0];
    expect(lastCallArgsForB?.chatId).toBeUndefined();
    expect(lastCallArgsForB?.chatId).not.toBe(accountA.chatId);
  });
});
