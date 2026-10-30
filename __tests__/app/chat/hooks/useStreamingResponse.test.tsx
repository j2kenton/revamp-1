import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useStreamingResponse } from '@/app/chat/hooks/useStreamingResponse';
import { useAuth } from '@/lib/auth/useAuth';
import { deriveCsrfToken } from '@/lib/auth/csrf';
import { isBypassAuthEnabled } from '@/lib/auth/bypass';
import { STRINGS } from '@/lib/constants/strings';

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

    it('sends the same idempotencyKey on the retry as the original attempt', async () => {
      // The server-side dedup (StreamIdempotencyRecord) only works if the
      // key is actually stable across a retry — this is the client half of
      // that contract, for a failure before message_created ever arrived.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(
          streamingResponseWith([
            {
              event: 'message_created',
              data: { chatId: 'chat-123', messageId: 'msg-real-9' },
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
      await act(async () => {
        jest.advanceTimersToNextTimer();
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const firstBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      const secondBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[1][1].body,
      );
      expect(firstBody.idempotencyKey).toMatch(/^temp_/);
      expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);

      jest.useRealTimers();
    });

    it('automatically retries a send that failed after message_created, resuming rather than duplicating it', async () => {
      // Update: this used to be permanently un-retriable once
      // message_created fired, on the theory that a resend would create a
      // duplicate user message with no way for the server to recognize a
      // retry. That's no longer true: the server's idempotency key
      // resolution (route.ts's `resolveIdempotentSend`) safely resumes an
      // already-persisted attempt under its original identity, so the
      // client retries a post-ack failure exactly like a pre-ack one —
      // it just must not render a second optimistic echo, since the real
      // message is already on screen.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => null },
          body: {
            getReader: () => {
              let step = 0;
              return {
                read: async () => {
                  if (step === 0) {
                    step += 1;
                    return {
                      done: false,
                      value: encodeSseEvents([
                        {
                          event: 'message_created',
                          data: { chatId: 'chat-123', messageId: 'msg-real-3' },
                        },
                      ]),
                    };
                  }
                  // Connection drops before message_complete arrives.
                  throw new Error('stream broke');
                },
              };
            },
          },
        } as unknown as Response)
        .mockResolvedValueOnce(
          streamingResponseWith([
            {
              event: 'message_created',
              data: { chatId: 'chat-123', messageId: 'msg-real-3' },
            },
            {
              event: 'content_delta',
              data: {
                messageId: 'ai-3',
                delta: 'Hi',
                accumulatedContent: 'Hi',
              },
            },
            {
              event: 'message_complete',
              data: { messageId: 'ai-3', content: 'Hi', metadata: {} },
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

      // While the retry is pending, still exactly one user message — no
      // second "sending" echo rendered beside the already-persisted one.
      const userMessagesBeforeRetry = result.current.liveMessages.filter(
        (m) => m.role === 'user',
      );
      expect(userMessagesBeforeRetry).toHaveLength(1);
      expect(userMessagesBeforeRetry[0].id).toBe('msg-real-3');

      await act(async () => {
        jest.advanceTimersToNextTimer();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const firstBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      const secondBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[1][1].body,
      );
      expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);

      // Still exactly one user message afterward — the retry's own
      // message_created (reporting the same ID) didn't create a second.
      const userMessagesAfter = result.current.liveMessages.filter(
        (m) => m.role === 'user',
      );
      expect(userMessagesAfter).toHaveLength(1);
      expect(userMessagesAfter[0].id).toBe('msg-real-3');
      expect(userMessagesAfter[0].status).toBe('sent');

      jest.useRealTimers();
    });

    it('reuses the same idempotencyKey on a later resend of the same content, even after message_created cleared tempId', async () => {
      // Regression: `handleMessageCreated` clears `tempId` once the echo is
      // reconciled. If the idempotencyKey sent to the server were derived
      // from `tempId` at resend time (as it used to be), a resend after
      // this exact failure — user message persisted, connection then died
      // before message_complete — would mint a brand-new key. The server
      // would find no record under it and process the resend as an
      // entirely new message: a duplicate user turn, even though the
      // original is sitting in Redis with the server's own resume path
      // built specifically to pick it back up under the original key.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      (
        global.fetch as jest.MockedFunction<typeof fetch>
      ).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: {
          getReader: () => {
            let step = 0;
            return {
              read: async () => {
                if (step === 0) {
                  step += 1;
                  return {
                    done: false,
                    value: encodeSseEvents([
                      {
                        event: 'message_created',
                        data: { chatId: 'chat-123', messageId: 'msg-real-10' },
                      },
                    ]),
                  };
                }
                throw new Error('stream broke');
              },
            };
          },
        },
      } as unknown as Response);

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendStreamingMessage('Hello');
      });

      const firstBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(firstBody.idempotencyKey).toMatch(/^temp_/);

      // The failure above (post-ack, no terminal event) now schedules an
      // automatic retry of its own — this test isn't about that path (see
      // "automatically retries a send that failed after message_created"
      // above for that), so drop the pending timer rather than let it fire
      // and confuse which fetch call is which. What's simulated here
      // instead is a *later*, independent resend of identical content —
      // e.g. a future manual "retry" action — which must still reuse the
      // same key.
      jest.clearAllTimers();
      (global.fetch as jest.MockedFunction<typeof fetch>).mockReturnValueOnce(
        new Promise(() => {}),
      );
      await act(async () => {
        void result.current.sendStreamingMessage('Hello');
      });

      const secondBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[1][1].body,
      );
      expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);

      jest.useRealTimers();
    });

    it('retries a send that never reached the server at all', async () => {
      // Contrast case for the test above: nothing was persisted (no
      // message_created), so reusing the echo and retrying is correct and
      // must still happen. The retry's own response completes cleanly
      // (message_created through message_complete) so it settles in one
      // attempt — this test is about the pre-ack retry specifically, not
      // the (separately covered) post-ack retry-and-resume path.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => null },
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
              data: { chatId: 'chat-123', messageId: 'msg-real-4' },
            },
            {
              event: 'content_delta',
              data: {
                messageId: 'ai-4',
                delta: 'Hi',
                accumulatedContent: 'Hi',
              },
            },
            {
              event: 'message_complete',
              data: { messageId: 'ai-4', content: 'Hi', metadata: {} },
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

      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const userMessages = result.current.liveMessages.filter(
        (m) => m.role === 'user',
      );
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].id).toBe('msg-real-4');

      jest.useRealTimers();
    });

    it('treats a clean stream close with no terminal event as a failure, not success', async () => {
      // Regression: a proxy/server closing an empty stream (done: true with
      // no message_created/message_complete/fallback/error) must not be
      // silently treated as a completed turn.
      //
      // Fake timers: this failure is retryable (nothing was persisted), so
      // it schedules a reconnect via a real setTimeout unless we control
      // the clock — left un-advanced here since the assertions only need
      // the immediate post-failure state, not the retry actually firing.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      (
        global.fetch as jest.MockedFunction<typeof fetch>
      ).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: {
          getReader: () => ({
            read: async () => ({ done: true, value: undefined }),
          }),
        },
      } as unknown as Response);

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendStreamingMessage('Hello');
      });

      // Set synchronously in the catch block, before any retry is
      // scheduled — no need to advance the (fake) clock to observe it.
      expect(result.current.error?.message).toBe(
        STRINGS.errors.streamInterrupted,
      );
      // Nothing was ever persisted, so the echo is still there, pending
      // its scheduled retry — never silently discarded.
      expect(result.current.liveMessages).toHaveLength(1);

      jest.useRealTimers();
    });

    it('stops reading after a terminal event, so a later transport hiccup can never trigger a resend', async () => {
      // Regression: handleMessageComplete/handleFallback both clear
      // lastUserMessageRef, which is the catch block's only signal that the
      // message was already persisted. If the loop kept reading after the
      // terminal event and that next read() rejected, the catch block would
      // see `alreadyPersisted === false` and resend — duplicating a message
      // that was already saved. Proven here by making a second read() call
      // throw: it must never be reached.
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
      const readMock = jest.fn().mockImplementationOnce(async () => ({
        done: false,
        value: encodeSseEvents([
          {
            event: 'message_created',
            data: { chatId: 'chat-123', messageId: 'msg-real-6' },
          },
          {
            event: 'message_complete',
            data: {
              messageId: 'assistant-6',
              content: 'Done',
              chatId: 'chat-123',
            },
          },
        ]),
      }));
      readMock.mockImplementation(async () => {
        throw new Error('read() called again after message_complete');
      });

      (
        global.fetch as jest.MockedFunction<typeof fetch>
      ).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: {
          getReader: () => ({
            read: readMock,
            cancel: jest.fn().mockResolvedValue(undefined),
          }),
        },
      } as unknown as Response);

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendStreamingMessage('Hello');
      });

      expect(readMock).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const userMessages = result.current.liveMessages.filter(
        (m) => m.role === 'user',
      );
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].id).toBe('msg-real-6');
    });

    it('marks a partial assistant reply failed instead of leaving it stuck at sending once retries are exhausted', async () => {
      // Regression: message_created + content_delta arrive (assistant reply
      // in progress, status 'sending'), then the connection dies before any
      // terminal event, on every attempt including the automatic resumes
      // that now follow a post-ack failure. Once those retries are
      // exhausted, the reply must be reconciled to 'failed' rather than
      // left 'sending' forever — which would render as a permanent spinner
      // beside the error banner.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      const makeFailingPartialReplyResponse = () => {
        const readMock = jest.fn().mockImplementationOnce(async () => ({
          done: false,
          value: encodeSseEvents([
            {
              event: 'message_created',
              data: { chatId: 'chat-123', messageId: 'msg-real-7' },
            },
            {
              event: 'content_delta',
              data: {
                messageId: 'assistant-7',
                accumulatedContent: 'Partial reply so far',
              },
            },
          ]),
        }));
        readMock.mockImplementation(async () => {
          throw new Error('stream broke mid-reply');
        });
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          body: { getReader: () => ({ read: readMock }) },
        } as unknown as Response;
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
        async () => makeFailingPartialReplyResponse(),
      );

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendStreamingMessage('Hello');
      });

      // Exhaust every automatic retry (MAX_RECONNECT_ATTEMPTS = 3) — each
      // resumed attempt fails the same way as the first.
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          jest.advanceTimersToNextTimer();
        });
      }

      const assistantEntries = result.current.liveMessages.filter(
        (m) => m.id === 'assistant-7',
      );
      expect(assistantEntries).toHaveLength(1);
      expect(assistantEntries[0].status).toBe('failed');
      // 1 initial attempt + 3 retries, all resuming the same persisted send.
      expect(global.fetch).toHaveBeenCalledTimes(4);
      const userMessages = result.current.liveMessages.filter(
        (m) => m.role === 'user',
      );
      // Never duplicated across any of the resumed attempts.
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].id).toBe('msg-real-7');

      jest.useRealTimers();
    });

    it('marks a superseded partial reply failed when a retry produces a new assistant ID', async () => {
      // Regression: `resetStateForNewStream` unconditionally clears
      // `pendingAssistantMessageRef` for the next attempt, and a retry's
      // reply always gets a brand-new ID (see route.ts) even though it
      // resumes the same user message. A test where every attempt happens
      // to reuse the same assistant ID would never catch a failure to
      // reconcile the FIRST attempt's entry before that ref moves on —
      // this uses two distinct IDs specifically to rule that out.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => null },
          body: {
            getReader: () => {
              let step = 0;
              return {
                read: async () => {
                  if (step === 0) {
                    step += 1;
                    return {
                      done: false,
                      value: encodeSseEvents([
                        {
                          event: 'message_created',
                          data: { chatId: 'chat-123', messageId: 'msg-real-8' },
                        },
                        {
                          event: 'content_delta',
                          data: {
                            messageId: 'assistant-8a',
                            accumulatedContent: 'Partial from first attempt',
                          },
                        },
                      ]),
                    };
                  }
                  throw new Error('stream broke');
                },
              };
            },
          },
        } as unknown as Response)
        .mockResolvedValueOnce(
          streamingResponseWith([
            {
              event: 'message_created',
              data: { chatId: 'chat-123', messageId: 'msg-real-8' },
            },
            {
              event: 'content_delta',
              data: {
                messageId: 'assistant-8b',
                delta: 'Hi',
                accumulatedContent: 'Hi',
              },
            },
            {
              event: 'message_complete',
              data: { messageId: 'assistant-8b', content: 'Hi', metadata: {} },
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

      await act(async () => {
        jest.advanceTimersToNextTimer();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // The superseded first attempt's entry must not be left at
      // 'sending' forever — no terminal handler for its old ID will ever
      // run again once the retry has moved on to a new one.
      const firstAttemptEntry = result.current.liveMessages.find(
        (m) => m.id === 'assistant-8a',
      );
      expect(firstAttemptEntry).toBeDefined();
      expect(firstAttemptEntry?.status).toBe('failed');

      const secondAttemptEntry = result.current.liveMessages.find(
        (m) => m.id === 'assistant-8b',
      );
      expect(secondAttemptEntry).toBeDefined();
      expect(secondAttemptEntry?.status).toBe('sent');

      jest.useRealTimers();
    });

    it('automatically retries a lock_lost error event instead of treating it as terminal', async () => {
      // Regression: the server emits `error` with `error: 'lock_lost'`
      // specifically because it's retryable — the idempotency lock was
      // lost mid-generation, but the user's message is still safely
      // resumable under its key (see route.ts). The client used to treat
      // every `error` event as terminal, leaving the persisted user
      // message without a reply until the user manually resent it.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce(
          streamingResponseWith([
            {
              event: 'message_created',
              data: { chatId: 'chat-123', messageId: 'msg-real-9' },
            },
            {
              event: 'error',
              data: {
                message: 'Lost the idempotency lock; please retry.',
                error: 'lock_lost',
              },
            },
          ]),
        )
        .mockResolvedValueOnce(
          streamingResponseWith([
            {
              event: 'message_created',
              data: { chatId: 'chat-123', messageId: 'msg-real-9' },
            },
            {
              event: 'content_delta',
              data: {
                messageId: 'assistant-9',
                delta: 'Hi',
                accumulatedContent: 'Hi',
              },
            },
            {
              event: 'message_complete',
              data: { messageId: 'assistant-9', content: 'Hi', metadata: {} },
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

      await act(async () => {
        jest.advanceTimersToNextTimer();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const firstBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      const secondBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[1][1].body,
      );
      expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);

      const assistantEntry = result.current.liveMessages.find(
        (m) => m.id === 'assistant-9',
      );
      expect(assistantEntry?.status).toBe('sent');
      expect(result.current.error).toBeNull();

      jest.useRealTimers();
    });

    it('still treats a non-lock_lost error event as terminal, with no retry', async () => {
      // Contrast case: only `lock_lost` is retryable. An arbitrary server
      // error (e.g. the LLM provider failed outright) must keep the
      // existing terminal behavior — retrying indefinitely on every kind
      // of error would be a very different, much riskier default.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      (
        global.fetch as jest.MockedFunction<typeof fetch>
      ).mockResolvedValueOnce(
        streamingResponseWith([
          {
            event: 'message_created',
            data: { chatId: 'chat-123', messageId: 'msg-real-10' },
          },
          {
            event: 'error',
            data: {
              message: 'Failed to generate response',
              error: 'generation_failed',
            },
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

      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.error).not.toBeNull();

      jest.useRealTimers();
    });
  });

  describe('reconnectAttempts does not leak across sends', () => {
    const failOnceViaNetworkError = () =>
      (
        global.fetch as jest.MockedFunction<typeof fetch>
      ).mockRejectedValueOnce(new Error('network down'));

    /**
     * Fire exactly the next scheduled backoff retry and let it settle.
     * Deliberately `advanceTimersToNextTimer()` rather than
     * `advanceTimersByTime(60_000)`: backoff delays are jittered and small
     * (≤4s) relative to a 60s window, so a single large `advanceTimersByTime`
     * call can cascade through a newly-scheduled follow-up retry within the
     * same call, firing more than one cycle and desyncing the fetch-call
     * count this test asserts on.
     */
    const advanceThroughOneRetryCycle = async () => {
      await act(async () => {
        jest.advanceTimersToNextTimer();
      });
    };

    it('resets after retries are exhausted, so the next message gets a full retry budget', async () => {
      // Regression: reconnectAttempts was only reset on the success path.
      // A message that exhausts all retries left it at MAX_RECONNECT_ATTEMPTS
      // (3), so the very next — unrelated — message's first failure would
      // immediately give up instead of retrying.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      // Message A: initial attempt + 3 retries, all failing outright.
      failOnceViaNetworkError();
      await act(async () => {
        await result.current.sendStreamingMessage('Message A');
      });
      for (let i = 0; i < 3; i++) {
        failOnceViaNetworkError();
        await advanceThroughOneRetryCycle();
      }
      expect(global.fetch).toHaveBeenCalledTimes(4);

      // Message B: first attempt fails. A leaked counter of 3 would give up
      // here with zero retries; a 6th fetch call proves one was scheduled.
      failOnceViaNetworkError();
      await act(async () => {
        await result.current.sendStreamingMessage('Message B');
      });
      expect(global.fetch).toHaveBeenCalledTimes(5);

      failOnceViaNetworkError();
      await advanceThroughOneRetryCycle();
      expect(global.fetch).toHaveBeenCalledTimes(6);

      jest.useRealTimers();
    });

    it('resets when closeConnection abandons an in-progress retry sequence', async () => {
      // Regression: closeConnection cancels the pending timer but left the
      // counter untouched. Abandoning a message 1 retry short of exhaustion
      // must not leave the next message starting almost out of budget.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      // Message A: 3 failures accumulate (reconnectAttempts would reach 3),
      // with a 4th retry pending — then abandoned before it ever fires.
      failOnceViaNetworkError();
      await act(async () => {
        await result.current.sendStreamingMessage('Message A');
      });
      for (let i = 0; i < 2; i++) {
        failOnceViaNetworkError();
        await advanceThroughOneRetryCycle();
      }
      expect(global.fetch).toHaveBeenCalledTimes(3);

      act(() => {
        result.current.closeConnection();
      });

      // Message B: first attempt fails. A leaked counter of 3 would give up
      // immediately; a 4th call here proves a retry was scheduled.
      failOnceViaNetworkError();
      await act(async () => {
        await result.current.sendStreamingMessage('Message B');
      });
      expect(global.fetch).toHaveBeenCalledTimes(4);

      failOnceViaNetworkError();
      await advanceThroughOneRetryCycle();
      expect(global.fetch).toHaveBeenCalledTimes(5);

      jest.useRealTimers();
    });

    it('resets when a retry attempt itself gets rate limited', async () => {
      // Regression: the 429 branch is a SEPARATE terminal exit from the
      // catch block's else branch — it returns directly and previously
      // skipped the reconnectAttempts reset entirely, including when the
      // 429 was hit by an automatic retry (not just a first attempt).
      const failOnceWithRateLimit = () =>
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

      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      // Message A: two network failures accumulate reconnectAttempts to 2,
      // then the next retry attempt is rate limited instead — a leaked
      // counter of 2 would let message B retry once before giving up
      // (reaching 3); a properly reset counter lets B use its full budget.
      failOnceViaNetworkError();
      await act(async () => {
        await result.current.sendStreamingMessage('Message A');
      });
      failOnceViaNetworkError();
      await advanceThroughOneRetryCycle();
      failOnceWithRateLimit();
      await advanceThroughOneRetryCycle();
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // Message B: exhaust its own retries fully. 4 calls (1 + 3 retries)
      // proves a full budget; a leaked counter of 2 would give up after 2.
      failOnceViaNetworkError();
      await act(async () => {
        await result.current.sendStreamingMessage('Message B');
      });
      for (let i = 0; i < 3; i++) {
        failOnceViaNetworkError();
        await advanceThroughOneRetryCycle();
      }
      expect(global.fetch).toHaveBeenCalledTimes(7);

      jest.useRealTimers();
    });
  });

  describe('the input stays locked through a pending retry', () => {
    it('keeps isStreaming true while a backoff retry is pending', async () => {
      // Regression: `finally` unconditionally cleared `isStreaming`, so the
      // input re-enabled the instant a retry was scheduled. Sending a
      // second message during that window shares lastUserMessageRef/
      // abortControllerRef with the pending retry and corrupts both.
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('network down'),
      );

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendStreamingMessage('Hello');
      });

      // A retry is now pending — the send is not actually done yet.
      expect(result.current.isStreaming).toBe(true);

      (
        global.fetch as jest.MockedFunction<typeof fetch>
      ).mockResolvedValueOnce(
        streamingResponseWith([
          {
            event: 'message_created',
            data: { chatId: 'chat-123', messageId: 'msg-real-8' },
          },
          {
            event: 'message_complete',
            data: { messageId: 'assistant-8', content: 'Done', chatId: 'chat-123' },
          },
        ]),
      );
      await act(async () => {
        jest.advanceTimersToNextTimer();
      });

      // The retry has now settled (successfully) — unlocked for real.
      expect(result.current.isStreaming).toBe(false);

      jest.useRealTimers();
    });

    it('unlocks once retries are exhausted, not just on success', async () => {
      jest.useFakeTimers();
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
      const rejectOnce = () =>
        (
          global.fetch as jest.MockedFunction<typeof fetch>
        ).mockRejectedValueOnce(new Error('network down'));

      rejectOnce();
      const { result } = renderHook(
        () => useStreamingResponse({ chatId: 'chat-123' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendStreamingMessage('Hello');
      });
      expect(result.current.isStreaming).toBe(true);

      for (let i = 0; i < 3; i++) {
        rejectOnce();
        await act(async () => {
          jest.advanceTimersToNextTimer();
        });
      }

      expect(result.current.isStreaming).toBe(false);
      jest.useRealTimers();
    });
  });

  describe('closeConnection abandons the current stream', () => {
    it('clears an in-flight optimistic echo, not just the network request', async () => {
      // Regression: "New Chat" clicked while chatId is still undefined (the
      // very first send hasn't been confirmed yet) can't rely on a chatId
      // change to clear liveMessages, because undefined -> undefined is a
      // no-op set. closeConnection must clear the echo itself.
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
      (global.fetch as jest.MockedFunction<typeof fetch>).mockReturnValueOnce(
        new Promise(() => {}),
      );

      const { result } = renderHook(
        () => useStreamingResponse({ chatId: undefined }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        void result.current.sendStreamingMessage('Abandoned message');
      });

      expect(result.current.liveMessages).toHaveLength(1);

      act(() => {
        result.current.closeConnection();
      });

      expect(result.current.liveMessages).toHaveLength(0);
      expect(result.current.streamingMessage).toBeNull();
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
