import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useStreamingResponse } from '@/app/chat/hooks/useStreamingResponse';
import { useAuth } from '@/lib/auth/useAuth';
import { deriveCsrfToken } from '@/lib/auth/csrf';
import { isBypassAuthEnabled } from '@/lib/auth/bypass';

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/auth/csrf', () => ({
  deriveCsrfToken: jest.fn(),
}));

jest.mock('@/lib/auth/bypass', () => ({
  isBypassAuthEnabled: jest.fn(),
  BYPASS_ACCESS_TOKEN: 'bypass-access-token',
  BYPASS_CSRF_TOKEN: 'bypass-csrf-token',
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockDeriveCsrfToken =
  deriveCsrfToken as jest.MockedFunction<typeof deriveCsrfToken>;
const mockIsBypassAuthEnabled =
  isBypassAuthEnabled as jest.MockedFunction<typeof isBypassAuthEnabled>;

const originalFetch = global.fetch;

beforeAll(() => {
  global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
});

afterAll(() => {
  global.fetch = originalFetch;
});

afterEach(() => {
  (global.fetch as jest.Mock).mockReset?.();
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return wrapper;
};

describe('useStreamingResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      accessToken: 'token',
      user: null,
      isAuthenticated: true,
      provider: 'microsoft',
      authIdentityKey: 'microsoft:test-user',
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      acquireGraphToken: jest.fn(),
      isLoading: false,
      error: null,
      needsReauth: false,
      clearError: jest.fn(),
    });
    mockDeriveCsrfToken.mockResolvedValue('csrf-token');
    mockIsBypassAuthEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_TEST_AUTH_MODE;
  });

  it('streams simulated data in automated test mode', async () => {
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'true';

    const { result } = renderHook(
      () =>
        useStreamingResponse({
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendStreamingMessage('Hello');
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.isComplete).toBe(true);
      expect(result.current.streamingMessage?.content).toContain('Thanks for your message');
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  it('throws when no authentication token is available', async () => {
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
    mockUseAuth.mockReturnValueOnce({
      status: 'unauthenticated',
      accessToken: null,
      user: null,
      isAuthenticated: false,
      provider: null,
      authIdentityKey: null,
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      acquireGraphToken: jest.fn(),
      isLoading: false,
      error: null,
      needsReauth: false,
      clearError: jest.fn(),
    });
    mockIsBypassAuthEnabled.mockReturnValue(false);

    const { result } = renderHook(
      () =>
        useStreamingResponse({
          chatId: 'chat-123',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendStreamingMessage('Hello world');
    });

    expect(result.current.error?.message).toBe('Not authenticated');
  });

  it('surface rate limit errors from the API', async () => {
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
    mockUseAuth.mockReturnValueOnce({
      status: 'authenticated',
      accessToken: 'token',
      user: null,
      isAuthenticated: true,
      provider: 'microsoft',
      authIdentityKey: 'microsoft:test-user',
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      acquireGraphToken: jest.fn(),
      isLoading: false,
      error: null,
      needsReauth: false,
      clearError: jest.fn(),
    });

    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      status: 429,
      ok: false,
      headers: {
        get: () => '5',
      },
      json: async () => ({
        error: { message: 'Too many requests', details: { retryAfter: 5 } },
      }),
    } as unknown as Response);

    const { result } = renderHook(
      () =>
        useStreamingResponse({
          chatId: 'chat-123',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendStreamingMessage('Hello');
    });

    expect(result.current.error?.name).toBe('RateLimitError');
    expect(result.current.rateLimitSeconds).toBe(5);
  });

  it('cancels a scheduled reconnect-with-backoff timer on unmount so it never fires a request with a stale identity', async () => {
    jest.useFakeTimers();
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

    // A stream that connects successfully but fails mid-read (not an
    // AbortError) schedules a reconnect via setTimeout with backoff. If that
    // timer isn't cancelled on unmount (e.g. an account switch unmounts
    // `AuthenticatedChat`), it fires later and starts a new request using
    // whatever token/chatId closures it captured from the unmounted hook —
    // silently sending a prior account's identity. See
    // `useStreamingResponse.ts`'s `closeConnection`, which cancels
    // `reconnectTimeoutRef` and is invoked by the hook's unmount effect.
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: jest.fn().mockRejectedValue(new Error('stream broke')),
        }),
      },
    } as unknown as Response);

    const { result, unmount } = renderHook(
      () =>
        useStreamingResponse({
          chatId: 'chat-123',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendStreamingMessage('Hello');
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    unmount();

    // Advance well past the first backoff delay (1s) and every subsequent
    // attempt's delay — if the timer survived unmount, this fires it.
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  describe('optimistic echo', () => {
    /** Encode SSE event blocks the way `/api/chat/stream` frames them. */
    const encodeSseEvents = (events: Array<{ event: string; data: unknown }>) =>
      new TextEncoder().encode(
        events
          .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
          .join(''),
      );

    const streamingResponseWith = (
      events: Array<{ event: string; data: unknown }>,
    ) => {
      const chunk = encodeSseEvents(events);
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
    };

    it('renders the user message immediately, before the server responds', async () => {
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
      // A fetch that never settles: the send is in flight and no server
      // event has arrived. The echo must already be visible.
      (global.fetch as jest.MockedFunction<typeof fetch>).mockReturnValueOnce(
        new Promise(() => {}),
      );

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        void result.current.sendStreamingMessage('Hello optimistically');
      });

      expect(result.current.liveMessages).toHaveLength(1);
      const echo = result.current.liveMessages[0];
      expect(echo.id).toMatch(/^temp_/);
      expect(echo.role).toBe('user');
      expect(echo.content).toBe('Hello optimistically');
      expect(echo.status).toBe('sending');
    });

    it('swaps the echo for the server copy when message_created arrives', async () => {
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
      (
        global.fetch as jest.MockedFunction<typeof fetch>
      ).mockResolvedValueOnce(
        streamingResponseWith([
          {
            event: 'message_created',
            data: { chatId: 'chat-123', messageId: 'msg-real-1' },
          },
        ]),
      );

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendStreamingMessage('Hello');
      });

      const userMessages = result.current.liveMessages.filter(
        (m) => m.role === 'user',
      );
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].id).toBe('msg-real-1');
      expect(userMessages[0].status).toBe('sent');
      expect(
        result.current.liveMessages.some((m) => m.id.startsWith('temp_')),
      ).toBe(false);
    });

    it('marks the echo failed when the send is rate limited', async () => {
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
      (
        global.fetch as jest.MockedFunction<typeof fetch>
      ).mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers: { get: () => '5' },
        json: async () => ({
          error: { message: 'Too many requests', details: { retryAfter: 5 } },
        }),
      } as unknown as Response);

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendStreamingMessage('Hello');
      });

      expect(result.current.error?.name).toBe('RateLimitError');
      expect(result.current.liveMessages).toHaveLength(1);
      expect(result.current.liveMessages[0].id).toMatch(/^temp_/);
      expect(result.current.liveMessages[0].status).toBe('failed');
    });

    it('reuses the same echo across a reconnect retry instead of duplicating it', async () => {
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      // First attempt: connects, then the read fails (not an abort) —
      // schedules a backoff retry of the same content. Second attempt:
      // succeeds and reconciles. At no point may two copies of the user's
      // message exist.
      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: jest.fn().mockRejectedValue(new Error('stream broke')),
            }),
          },
        } as unknown as Response)
        .mockResolvedValueOnce(
          streamingResponseWith([
            {
              event: 'message_created',
              data: { chatId: 'chat-123', messageId: 'msg-real-2' },
            },
          ]),
        );

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendStreamingMessage('Hello again');
      });

      // Failed once; echo still pending a retry, not duplicated.
      expect(
        result.current.liveMessages.filter((m) => m.role === 'user'),
      ).toHaveLength(1);

      // Fire the backoff timer to run the retry.
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      const userMessages = result.current.liveMessages.filter(
        (m) => m.role === 'user',
      );
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].id).toBe('msg-real-2');

      jest.useRealTimers();
    });
  });

  it('keeps closeConnection referentially stable across re-renders so the unmount-cleanup effect never fires mid-stream', () => {
    // `closeConnection` is a dependency of an effect that calls it on
    // cleanup (see the effect at the bottom of useStreamingResponse.ts). If
    // this function's identity changed on every render, that effect would
    // tear down and re-run on every render too — aborting the in-flight SSE
    // connection on every content_delta during an active stream, not just on
    // unmount. This must stay stable across re-renders regardless of
    // whether memoization is written by hand or inferred by the React
    // Compiler.
    const { result, rerender } = renderHook(
      (props) => useStreamingResponse(props),
      { wrapper: createWrapper(), initialProps: { chatId: 'chat-123' } },
    );

    const firstCloseConnection = result.current.closeConnection;
    rerender({ chatId: 'chat-123' });
    const secondCloseConnection = result.current.closeConnection;

    expect(secondCloseConnection).toBe(firstCloseConnection);
  });
});
