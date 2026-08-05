import { POST, resolveIdempotentSend } from '@/app/api/chat/stream/route';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { withCsrfProtection as mockWithCsrfProtection } from '@/server/middleware/csrf';
import { requireSession as mockRequireSession } from '@/server/middleware/session';
import {
  createChat,
  getChatLookup,
  addMessage,
  getRecentChatMessagesLookup,
  getStreamIdempotencyRecord,
  persistMessageWithIdempotencyRecord,
  acquireStreamIdempotencyLock,
  renewStreamIdempotencyLock,
  releaseStreamIdempotencyLock,
} from '@/lib/redis/chat';
import {
  callLLMStreamWithRetry,
  truncateMessagesToFit,
  getCircuitBreaker,
} from '@/lib/llm/service';

/** Shorthand for the three `StreamIdempotencyLookup` shapes the route reads. */
const found = (record: unknown) => ({ status: 'found' as const, record });
const notFound = () => ({ status: 'not_found' as const });
const lookupError = () => ({ status: 'error' as const });

/** Shorthand for the three `ChatLookup` shapes the route reads. */
const chatFound = (chat: unknown) => ({ status: 'found' as const, chat });
const chatNotFound = () => ({ status: 'not_found' as const });
const chatLookupError = () => ({ status: 'error' as const });

/** Shorthand for the two `ChatMessagesLookup` shapes the route reads. */
const messagesFound = (messages: unknown[]) => ({
  status: 'found' as const,
  messages,
});
const messagesLookupError = () => ({ status: 'error' as const });

jest.mock('next-auth');
jest.mock('@/server/middleware/csrf', () => ({
  withCsrfProtection: jest.fn().mockResolvedValue({ valid: true }),
}));
jest.mock('@/server/middleware/session', () => ({
  requireSession: jest.fn(),
}));
jest.mock('@/server/middleware/rate-limit', () => ({
  withChatRateLimit: jest.fn(
    (handler: (request: NextRequest) => Promise<Response>) => handler,
  ),
}));
jest.mock('@/lib/redis/chat', () => ({
  createChat: jest.fn(),
  getChatLookup: jest.fn(),
  addMessage: jest.fn(),
  getRecentChatMessagesLookup: jest.fn(),
  getStreamIdempotencyRecord: jest.fn(),
  persistMessageWithIdempotencyRecord: jest.fn(),
  acquireStreamIdempotencyLock: jest.fn(),
  renewStreamIdempotencyLock: jest.fn(),
  releaseStreamIdempotencyLock: jest.fn(),
  // Kept equal to the real constant (lib/redis/chat.ts): the route derives
  // its renewal interval from this at *import* time (TTL / 3), and
  // documents an invariant that the poll-budget elsewhere must stay >=
  // this value. A mismatched mock doesn't break anything today only
  // because every test that touches renewal invokes the captured interval
  // callback directly rather than waiting on real timing — but it'd
  // silently mislead any future assertion that does care about the actual
  // interval duration.
  STREAM_IDEMPOTENCY_LOCK_TTL_SECONDS: 15,
}));
jest.mock('@/lib/llm/service', () => ({
  callLLMStreamWithRetry: jest.fn(),
  truncateMessagesToFit: jest.fn().mockReturnValue({
    messages: [],
    truncated: false,
    removedCount: 0,
  }),
  getFallbackMessage: jest.fn().mockReturnValue('Fallback'),
  getCircuitBreaker: jest.fn().mockReturnValue({ getState: () => 'CLOSED' }),
}));

describe('POST /api/chat/stream', () => {
  const mockSession = {
    user: { id: 'test-user-id', email: 'test@example.com' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (mockWithCsrfProtection as jest.Mock).mockResolvedValue({ valid: true });
    (mockRequireSession as jest.Mock).mockResolvedValue({
      userId: mockSession.user.id,
    });
    (getChatLookup as jest.Mock).mockResolvedValue(chatNotFound());
    (createChat as jest.Mock).mockResolvedValue({
      id: 'chat-123',
      userId: mockSession.user.id,
    });
    (getRecentChatMessagesLookup as jest.Mock).mockResolvedValue(messagesFound([]));
    (addMessage as jest.Mock).mockResolvedValue(true);
    (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(notFound());
    (acquireStreamIdempotencyLock as jest.Mock).mockResolvedValue({
      token: 'lock-token-1',
    });
    (persistMessageWithIdempotencyRecord as jest.Mock).mockResolvedValue(true);
    (renewStreamIdempotencyLock as jest.Mock).mockResolvedValue(true);
    (releaseStreamIdempotencyLock as jest.Mock).mockResolvedValue(undefined);
    (callLLMStreamWithRetry as jest.Mock).mockImplementation(
      async (_messages, onToken: (chunk: string) => void) => {
        onToken('Hello');
        onToken(' world');
        return { model: 'mock-model', tokensUsed: 2 };
      },
    );
    (truncateMessagesToFit as jest.Mock).mockReturnValue({
      messages: [],
      truncated: false,
      removedCount: 0,
    });
    (getCircuitBreaker as jest.Mock).mockReturnValue({
      getState: () => 'CLOSED',
    });
  });

  describe('Streaming Response', () => {
    it('returns a ReadableStream for valid requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Hello streaming' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.body).toBeInstanceOf(ReadableStream);
    });

    it('handles stream cancellation gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test cancellation' }),
      });

      const response = await POST(request);
      const reader = response.body?.getReader();

      // Read first chunk then cancel
      if (reader) {
        await reader.read();
        await reader.cancel();
      }

      expect(response.status).toBe(200);
    });

    it('streams tokens progressively', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test streaming' }),
      });

      const response = await POST(request);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            chunks.push(decoder.decode(value));
          }
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((chunk) => chunk.includes('data:'))).toBe(true);
    });
  });

  describe('Error Handling in Stream', () => {
    it('sends error event on stream failure', async () => {
      (callLLMStreamWithRetry as jest.Mock).mockImplementationOnce(async () => {
        throw new Error('Stream interrupted');
      });
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test error' }),
      });

      const response = await POST(request);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let errorReceived = false;

      if (reader) {
        try {
          let done = false;
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              const chunk = decoder.decode(value);
              if (chunk.includes('event: error')) {
                errorReceived = true;
                break;
              }
            }
          }
        } catch {
          errorReceived = true;
        }
      }

      expect(errorReceived).toBe(true);
    });
  });

  describe('Abort Signal Handling', () => {
    it('respects abort signal from client', async () => {
      const abortController = new AbortController();
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test abort' }),
        signal: abortController.signal,
      });

      // Start request then abort
      const responsePromise = POST(request);
      abortController.abort();

      const response = await responsePromise;
      expect(response.status).toBe(200); // Stream starts successfully
    });
  });

  describe('Idempotency (retried sends)', () => {
    /** Fully drain an SSE response and return the decoded text. */
    async function readAllSseText(response: Response): Promise<string> {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let text = '';
      if (!reader) return text;
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          text += decoder.decode(result.value);
        }
      }
      return text;
    }

    const requestWithIdempotencyKey = (idempotencyKey: string) =>
      new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Hello', idempotencyKey }),
      });

    it('replays a completed send instead of calling the LLM again', async () => {
      // The core bug: a retry that arrives after the original attempt fully
      // finished must not duplicate the user message, the chat, or the LLM
      // call — it should just get the same result back.
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(
        found({
          chatId: 'chat-existing',
          userMessageId: 'msg-existing-user',
          truncated: false,
          removedCount: 0,
          outcome: {
            kind: 'complete',
            messageId: 'msg-existing-ai',
            content: 'Previously generated reply',
            metadata: { model: 'mock-model' },
          },
        }),
      );

      const response = await POST(requestWithIdempotencyKey('retry-key-1'));
      const text = await readAllSseText(response);

      expect(text).toContain('event: message_created');
      expect(text).toContain('"messageId":"msg-existing-user"');
      // Not 'event: complete' — the client's dispatch switches on the
      // literal SSE event name, which for a normal completion is
      // 'message_complete'. A mismatch here would replay silently into a
      // dead `default: break` on the client with no visible symptom.
      expect(text).toContain('event: message_complete');
      expect(text).toContain('Previously generated reply');
      expect(createChat).not.toHaveBeenCalled();
      expect(addMessage).not.toHaveBeenCalled();
      expect(callLLMStreamWithRetry).not.toHaveBeenCalled();
      expect(acquireStreamIdempotencyLock).not.toHaveBeenCalled();
    });

    it('replays a completed fallback outcome with the correct event name', async () => {
      // Sibling of the previous test's discriminant-to-event-name mapping —
      // 'fallback' happens to be spelled the same in both places, so this
      // is the branch that could hide a similar mismatch silently.
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(
        found({
          chatId: 'chat-existing',
          userMessageId: 'msg-existing-user',
          truncated: false,
          removedCount: 0,
          outcome: {
            kind: 'fallback',
            messageId: 'msg-existing-fallback',
            content: 'Fallback reply',
            metadata: { circuitBreakerOpen: true },
          },
        }),
      );

      const response = await POST(requestWithIdempotencyKey('retry-key-2'));
      const text = await readAllSseText(response);

      expect(text).toContain('event: fallback');
      expect(text).toContain('Fallback reply');
      expect(callLLMStreamWithRetry).not.toHaveBeenCalled();
    });

    it('acquires the lock and persists atomically on a first-time send', async () => {
      const response = await POST(requestWithIdempotencyKey('fresh-key-1'));
      await readAllSseText(response);

      expect(acquireStreamIdempotencyLock).toHaveBeenCalledWith(
        'test-user-id',
        'fresh-key-1',
      );
      // The message and its idempotency-record transition are written
      // together, atomically — never as two separate calls (a crash
      // between them would orphan the message with no record to resume
      // from). `addMessage` (the unpaired write) must not be used at all
      // once an idempotency key is present.
      expect(persistMessageWithIdempotencyRecord).toHaveBeenCalledTimes(2);
      expect(addMessage).not.toHaveBeenCalled();

      const [, userMessageArg, , , progressRecord, firstToken] = (
        persistMessageWithIdempotencyRecord as jest.Mock
      ).mock.calls[0];
      expect(userMessageArg.role).toBe('user');
      expect(progressRecord.outcome).toBeUndefined();
      expect(firstToken).toBe('lock-token-1');

      const [, aiMessageArg, , , finalRecord, secondToken] = (
        persistMessageWithIdempotencyRecord as jest.Mock
      ).mock.calls[1];
      expect(aiMessageArg.role).toBe('assistant');
      expect(finalRecord.outcome.kind).toBe('complete');
      // Same token on both writes — the fence that makes the write
      // conditional on still owning the lock only works if the caller
      // actually passes its own token through, not a stale or missing one.
      expect(secondToken).toBe('lock-token-1');

      expect(releaseStreamIdempotencyLock).toHaveBeenCalledWith(
        'test-user-id',
        'fresh-key-1',
        'lock-token-1',
      );
    });

    it('bails out rather than proceed as if unpersisted data were saved', async () => {
      // Regression: `addMessage`/`persistMessageWithIdempotencyRecord`
      // return a boolean; a caller that ignores it and carries on (sending
      // `message_created`, calling the LLM) would act as though a failed
      // write had succeeded. The user-message persist happens before the
      // SSE stream is constructed, so a failure here surfaces as an
      // ordinary JSON error response (the outer catch), not an SSE
      // `event: error` frame — that framing only applies to failures once
      // the stream body is already running.
      (persistMessageWithIdempotencyRecord as jest.Mock).mockResolvedValueOnce(
        false,
      );

      const response = await POST(requestWithIdempotencyKey('fresh-key-2'));

      expect(response.headers.get('content-type')).not.toBe(
        'text/event-stream',
      );
      const body = await response.json();
      expect(body.error.message).toBe('Failed to initialize stream');
      expect(callLLMStreamWithRetry).not.toHaveBeenCalled();
    });

    it('surfaces an SSE error event when the assistant reply fails to persist', async () => {
      // Complement to the previous test: the failure this time happens
      // *inside* the stream body (after message_created has already been
      // sent), where the endpoint's only defined failure signal is the
      // ordinary SSE `error` event — same boolean-return contract, but a
      // different point in the flow where the failure surfaces.
      (persistMessageWithIdempotencyRecord as jest.Mock)
        .mockResolvedValueOnce(true) // user message persists fine
        .mockResolvedValueOnce(false); // assistant reply does not

      const response = await POST(requestWithIdempotencyKey('fresh-key-3'));
      const text = await readAllSseText(response);

      expect(text).toContain('event: message_created');
      expect(text).toContain('event: error');
      expect(text).not.toContain('event: message_complete');
    });

    it('sets up an independent renewal interval whose callback renews the lease', async () => {
      // Renewal now runs on a real `setInterval`, independent of chunk
      // arrival (the fix for a provider that hangs before producing any
      // output — the old chunk-gated check would never fire at all in
      // that case). Deliberately not `jest.useFakeTimers()` to actually
      // advance it: this suite avoids the fake-timer system entirely (see
      // `resolveIdempotentSend`'s doc comment — it hung and then exhausted
      // the heap when combined with reading a real ReadableStream body).
      // Instead, capture the callback `setInterval` was given and invoke it
      // directly, proving it renews correctly without needing real time to
      // pass or fake timers to fight the stream machinery.
      const capturedCallbacks: Array<() => void> = [];
      const setIntervalSpy = jest
        .spyOn(global, 'setInterval')
        .mockImplementation(((fn: () => void) => {
          capturedCallbacks.push(fn);
          // A non-zero sentinel: production's `if (renewalTimer)` guards
          // (release/cleanup paths) would silently skip clearInterval if
          // this were falsy `0`, masking exactly what these tests check.
          return 1 as unknown as NodeJS.Timeout;
        }) as typeof setInterval);

      const response = await POST(requestWithIdempotencyKey('renew-key'));
      await readAllSseText(response);

      expect(capturedCallbacks.length).toBeGreaterThan(0);
      capturedCallbacks[0]();
      // The callback's renewal call is fire-and-forget (not awaited by the
      // interval), so let its microtask resolve before asserting.
      await Promise.resolve();
      await Promise.resolve();

      expect(renewStreamIdempotencyLock).toHaveBeenCalledWith(
        'test-user-id',
        'renew-key',
        'lock-token-1',
      );

      setIntervalSpy.mockRestore();
    });

    it('does not set up a renewal interval when there is no idempotency key', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Hello, no key here' }),
      });
      const response = await POST(request);
      await readAllSseText(response);

      expect(setIntervalSpy).not.toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    });

    it('stops relaying and persisting once the renewal callback reports the lock is lost', async () => {
      // Regression: losing the lease used to just log a warning and keep
      // going — the request would carry on relaying deltas and, at the
      // end, attempt to persist a reply under a lock another request now
      // legitimately holds (the fence would reject that write, but only
      // after a wasted LLM round trip and a confusing generic error). Once
      // `lockLost` is set, no further chunk should reach the client and the
      // final persist must be skipped in favour of an explicit error event.
      const capturedCallbacks: Array<() => void> = [];
      const setIntervalSpy = jest
        .spyOn(global, 'setInterval')
        .mockImplementation(((fn: () => void) => {
          capturedCallbacks.push(fn);
          // A non-zero sentinel: production's `if (renewalTimer)` guards
          // (release/cleanup paths) would silently skip clearInterval if
          // this were falsy `0`, masking exactly what these tests check.
          return 1 as unknown as NodeJS.Timeout;
        }) as typeof setInterval);

      (renewStreamIdempotencyLock as jest.Mock).mockResolvedValueOnce(false);
      (callLLMStreamWithRetry as jest.Mock).mockImplementationOnce(
        async (_messages, onToken: (chunk: string) => void) => {
          onToken('Hello');
          // Simulate the independent renewal interval ticking mid-generation
          // and finding the lease already lost.
          capturedCallbacks[0]();
          await Promise.resolve();
          await Promise.resolve();
          onToken(' world'); // must not reach the client after loss
          return { model: 'mock-model', tokensUsed: 2 };
        },
      );

      const response = await POST(requestWithIdempotencyKey('lost-lock-key'));
      const text = await readAllSseText(response);

      expect(text).toContain('"delta":"Hello"');
      expect(text).not.toContain('"delta":" world"');
      expect(text).toContain('event: error');
      expect(text).toContain('lock_lost');
      expect(text).not.toContain('event: message_complete');
      // Only the user message's fenced write should have happened — never
      // the assistant reply's.
      expect(persistMessageWithIdempotencyRecord).toHaveBeenCalledTimes(1);

      setIntervalSpy.mockRestore();
    });

    it('never calls the LLM when the lock was already confirmed lost before generation started', async () => {
      // Regression: a renewal failure during chat/history preparation (all
      // of which runs before the SSE stream body even starts) used to be
      // invisible until the persist-time check at the very end — the LLM
      // still got called, and the client waited through a full round trip
      // just to be told the write was rejected. Ownership must be checked
      // before ever invoking the LLM, not only before persisting after it.
      const capturedCallbacks: Array<() => void> = [];
      const setIntervalSpy = jest
        .spyOn(global, 'setInterval')
        .mockImplementation(((fn: () => void) => {
          capturedCallbacks.push(fn);
          // A non-zero sentinel: production's `if (renewalTimer)` guards
          // (release/cleanup paths) would silently skip clearInterval if
          // this were falsy `0`, masking exactly what these tests check.
          return 1 as unknown as NodeJS.Timeout;
        }) as typeof setInterval);

      (renewStreamIdempotencyLock as jest.Mock).mockResolvedValueOnce(false);
      // Simulate the renewal interval ticking (and finding the lease
      // already lost) while chat history is still being fetched — well
      // before the LLM would ever be called.
      (getRecentChatMessagesLookup as jest.Mock).mockImplementationOnce(async () => {
        capturedCallbacks[0]();
        await Promise.resolve();
        await Promise.resolve();
        return messagesFound([]);
      });

      const response = await POST(
        requestWithIdempotencyKey('lost-before-llm-key'),
      );
      const text = await readAllSseText(response);

      expect(callLLMStreamWithRetry).not.toHaveBeenCalled();
      expect(text).toContain('event: error');
      expect(text).toContain('lock_lost');
      expect(text).not.toContain('event: message_complete');
      expect(text).not.toContain('event: content_delta');

      setIntervalSpy.mockRestore();
    });

    it('stops the renewal interval and proactively releases the lock as soon as loss is detected, not only at the end', async () => {
      // Regression: a renewal failure set a flag and kept logging, but
      // nothing stopped the interval from continuing to tick, and nothing
      // released the lock early — a transient renewal error (or a
      // confirmed reclaim) left this request's lease sitting until its
      // full TTL lapsed, blocking a legitimate new holder from reclaiming
      // it sooner even though this request has already given up on it.
      const capturedCallbacks: Array<() => void> = [];
      const setIntervalSpy = jest
        .spyOn(global, 'setInterval')
        .mockImplementation(((fn: () => void) => {
          capturedCallbacks.push(fn);
          // A non-zero sentinel: production's `if (renewalTimer)` guards
          // (release/cleanup paths) would silently skip clearInterval if
          // this were falsy `0`, masking exactly what these tests check.
          return 1 as unknown as NodeJS.Timeout;
        }) as typeof setInterval);
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      (renewStreamIdempotencyLock as jest.Mock).mockResolvedValueOnce(false);

      let releaseCallCountWhenLossDetected = -1;
      let clearIntervalCallCountWhenLossDetected = -1;
      (callLLMStreamWithRetry as jest.Mock).mockImplementationOnce(
        async (_messages, onToken: (chunk: string) => void) => {
          onToken('Hello');
          capturedCallbacks[0]();
          await Promise.resolve();
          await Promise.resolve();
          // Captured while the (mocked) LLM call is still in flight —
          // before the stream's own end-of-request cleanup ever runs —
          // to prove the stop/release happened proactively, not just as
          // part of normal teardown.
          releaseCallCountWhenLossDetected = (
            releaseStreamIdempotencyLock as jest.Mock
          ).mock.calls.length;
          clearIntervalCallCountWhenLossDetected =
            clearIntervalSpy.mock.calls.length;
          return { model: 'mock-model', tokensUsed: 1 };
        },
      );

      const response = await POST(
        requestWithIdempotencyKey('renew-fail-key'),
      );
      await readAllSseText(response);

      expect(releaseCallCountWhenLossDetected).toBe(1);
      expect(clearIntervalCallCountWhenLossDetected).toBe(1);
      expect(releaseStreamIdempotencyLock).toHaveBeenCalledWith(
        'test-user-id',
        'renew-fail-key',
        'lock-token-1',
      );

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });

    it('resumes an abandoned attempt by reusing its identity, not creating a second user message', async () => {
      // The original attempt persisted the user message and then crashed
      // (or its lock simply expired) before completing the reply. A retry
      // that then wins the lock immediately should finish the job under
      // the SAME message/chat identity, not start over with a new one.
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(
        found({
          chatId: 'chat-resumed',
          userMessageId: 'msg-resumed-user',
          truncated: false,
          removedCount: 0,
        }),
      );
      (getChatLookup as jest.Mock).mockResolvedValue(
        chatFound({
          id: 'chat-resumed',
          userId: 'test-user-id',
        }),
      );
      (getRecentChatMessagesLookup as jest.Mock).mockResolvedValue(
        messagesFound([
          {
            id: 'msg-resumed-user',
            chatId: 'chat-resumed',
            role: 'user',
            content: 'Hello',
            status: 'sent',
            parentMessageId: null,
            metadata: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      );

      const response = await POST(requestWithIdempotencyKey('resume-key'));
      const text = await readAllSseText(response);

      expect(text).toContain('"messageId":"msg-resumed-user"');
      expect(createChat).not.toHaveBeenCalled();
      // Only the AI reply gets persisted here — the user message already
      // exists from the original attempt.
      expect(persistMessageWithIdempotencyRecord).toHaveBeenCalledTimes(1);
      expect(addMessage).not.toHaveBeenCalled();
      expect(
        (persistMessageWithIdempotencyRecord as jest.Mock).mock.calls[0][1],
      ).toEqual(expect.objectContaining({ role: 'assistant' }));
      expect(
        (persistMessageWithIdempotencyRecord as jest.Mock).mock.calls[0][0],
      ).toBe('chat-resumed');
    });

    it('releases the lock when the requested chat does not exist', async () => {
      // Regression: this validation failure is a plain `return`, not a
      // thrown error — it bypasses the outer catch's cleanup entirely, so
      // without an explicit release here the lock sat held for its full
      // TTL despite never entering the critical section it protects.
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({
          content: 'Hello',
          idempotencyKey: 'orphan-key-1',
          chatId: 'does-not-exist',
        }),
      });
      (getChatLookup as jest.Mock).mockResolvedValue(chatNotFound());

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(releaseStreamIdempotencyLock).toHaveBeenCalledWith(
        'test-user-id',
        'orphan-key-1',
        'lock-token-1',
      );
    });

    it('releases the lock when the chat belongs to a different user', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({
          content: 'Hello',
          idempotencyKey: 'orphan-key-2',
          chatId: 'someone-elses-chat',
        }),
      });
      (getChatLookup as jest.Mock).mockResolvedValue(
        chatFound({
          id: 'someone-elses-chat',
          userId: 'a-different-user',
        }),
      );

      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(releaseStreamIdempotencyLock).toHaveBeenCalledWith(
        'test-user-id',
        'orphan-key-2',
        'lock-token-1',
      );
    });

    it('releases the lock and fails closed when the requested chat lookup errors', async () => {
      // Regression: a `getChatLookup` read failure used to be indistinguishable
      // from "chat genuinely doesn't exist" — silently falling through to
      // create a brand-new chat under a chatId the client already believes
      // is real. Must fail closed instead, and ask for a retry.
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({
          content: 'Hello',
          idempotencyKey: 'orphan-key-3',
          chatId: 'unreadable-chat',
        }),
      });
      (getChatLookup as jest.Mock).mockResolvedValue(chatLookupError());

      const response = await POST(request);

      expect(response.status).toBe(500);
      expect(createChat).not.toHaveBeenCalled();
      expect(releaseStreamIdempotencyLock).toHaveBeenCalledWith(
        'test-user-id',
        'orphan-key-3',
        'lock-token-1',
      );
    });

    it('releases the lock and fails closed when the resumed chat lookup errors', async () => {
      // Same failure mode as above, but for the resume path specifically —
      // this is the higher-stakes case: the idempotency record says a real
      // user message was already persisted into this chat, so treating an
      // unreadable lookup as "gone" risks duplicating that turn.
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(
        found({
          chatId: 'chat-resumed-3',
          userMessageId: 'msg-resumed-user-3',
          truncated: false,
          removedCount: 0,
        }),
      );
      (getChatLookup as jest.Mock).mockResolvedValue(chatLookupError());

      const response = await POST(
        requestWithIdempotencyKey('resume-key-lookup-error'),
      );

      expect(response.status).toBe(500);
      expect(createChat).not.toHaveBeenCalled();
      expect(callLLMStreamWithRetry).not.toHaveBeenCalled();
      expect(releaseStreamIdempotencyLock).toHaveBeenCalledWith(
        'test-user-id',
        'resume-key-lookup-error',
        'lock-token-1',
      );
    });

    it('releases the lock and fails closed when the resumed history lookup errors', async () => {
      // Resuming needs to confirm the record's specific `userMessageId` is
      // really there — an unreadable history means that can't be verified,
      // unlike a fresh send (which tolerates the same failure by falling
      // back to an empty history further down, since it has no particular
      // prior message it needs to find).
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(
        found({
          chatId: 'chat-resumed-4',
          userMessageId: 'msg-resumed-user-4',
          truncated: false,
          removedCount: 0,
        }),
      );
      (getChatLookup as jest.Mock).mockResolvedValue(
        chatFound({ id: 'chat-resumed-4', userId: 'test-user-id' }),
      );
      (getRecentChatMessagesLookup as jest.Mock).mockResolvedValue(
        messagesLookupError(),
      );

      const response = await POST(
        requestWithIdempotencyKey('resume-key-history-error'),
      );

      expect(response.status).toBe(500);
      expect(callLLMStreamWithRetry).not.toHaveBeenCalled();
      expect(releaseStreamIdempotencyLock).toHaveBeenCalledWith(
        'test-user-id',
        'resume-key-history-error',
        'lock-token-1',
      );
    });

    it('tolerates a history lookup error on a fresh (non-resumed) send, falling back to empty history', async () => {
      // Contrast case: a fresh send has no specific prior message it needs
      // to confirm, so an unreadable history degrades to "no history yet"
      // rather than failing the whole request — the current message is
      // still included via `sanitizedContent`.
      (getRecentChatMessagesLookup as jest.Mock).mockResolvedValue(
        messagesLookupError(),
      );

      const response = await POST(
        new NextRequest('http://localhost:3000/api/chat/stream', {
          method: 'POST',
          body: JSON.stringify({ content: 'Hello' }),
        }),
      );
      await readAllSseText(response);

      expect(response.status).toBe(200);
      expect(truncateMessagesToFit).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Hello' }),
        ]),
        expect.anything(),
      );
    });

    it('falls back to appending the request content if the resumed message is missing from history, and restores it', async () => {
      // Regression: history reads back successfully (this is NOT the read
      // failure covered above) but genuinely doesn't contain the message
      // the resumed record says should already be persisted. The LLM
      // context must fall back to the request's own content (so the reply
      // isn't generated from an empty prompt) — and, since this is
      // genuinely confirmed missing (not just unreadable), the user
      // message must be restored under its original ID so the assistant
      // reply saved afterward doesn't reference a parentMessageId that was
      // never actually written.
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(
        found({
          chatId: 'chat-resumed-2',
          userMessageId: 'msg-resumed-user-2',
          truncated: false,
          removedCount: 0,
        }),
      );
      (getChatLookup as jest.Mock).mockResolvedValue(
        chatFound({
          id: 'chat-resumed-2',
          userId: 'test-user-id',
        }),
      );
      // Simulates the legitimately-missing case: history reads back fine,
      // it just doesn't contain the resumed message.
      (getRecentChatMessagesLookup as jest.Mock).mockResolvedValue(
        messagesFound([]),
      );

      const response = await POST(
        requestWithIdempotencyKey('resume-key-missing-history'),
      );
      await readAllSseText(response);

      expect(truncateMessagesToFit).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Hello' }),
        ]),
        expect.anything(),
      );

      // Restored (user message, ID reused from the record) + the assistant
      // reply — both fenced on the same lock token.
      expect(persistMessageWithIdempotencyRecord).toHaveBeenCalledTimes(2);
      const [restoreArgs, replyArgs] = (
        persistMessageWithIdempotencyRecord as jest.Mock
      ).mock.calls;
      expect(restoreArgs[1]).toEqual(
        expect.objectContaining({
          id: 'msg-resumed-user-2',
          role: 'user',
          content: 'Hello',
        }),
      );
      expect(replyArgs[1]).toEqual(expect.objectContaining({ role: 'assistant' }));
    });
  });

  describe('resolveIdempotentSend (polling/reclaim logic, tested directly)', () => {
    // Genuinely tiny real millisecond values — these tests run in real time
    // rather than via jest.useFakeTimers(), which does not play well with
    // this suite's use of a real ReadableStream elsewhere (see
    // resolveIdempotentSend's doc comment). At 2ms/10ms this describe block
    // still runs in well under a second.
    const FAST_OPTIONS = { pollIntervalMs: 2, totalBudgetMs: 10 };

    it('returns replay immediately when the record already has an outcome', async () => {
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(
        found({
          chatId: 'chat-1',
          userMessageId: 'user-1',
          truncated: false,
          removedCount: 0,
          outcome: { kind: 'complete', messageId: 'ai-1', content: 'hi', metadata: {} },
        }),
      );

      const result = await resolveIdempotentSend('user-1', 'key-1', FAST_OPTIONS);

      expect(result.type).toBe('replay');
      expect(acquireStreamIdempotencyLock).not.toHaveBeenCalled();
    });

    it('returns own immediately when the lock is free', async () => {
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(notFound());
      (acquireStreamIdempotencyLock as jest.Mock).mockResolvedValue({
        token: 'token-a',
      });

      const result = await resolveIdempotentSend('user-1', 'key-2', FAST_OPTIONS);

      expect(result).toEqual({ type: 'own', token: 'token-a', record: null });
    });

    it('retries acquisition on every poll tick, not just re-reads the record', async () => {
      // A lock abandoned by a crashed holder must be reclaimed as soon as
      // its TTL lapses — not only noticed after the full wait budget runs
      // out. Fails to acquire twice, then succeeds on the third attempt.
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(
        found({
          chatId: 'chat-2',
          userMessageId: 'user-2',
          truncated: false,
          removedCount: 0,
        }),
      );
      (acquireStreamIdempotencyLock as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ token: 'token-b' });

      const result = await resolveIdempotentSend('user-1', 'key-3', {
        pollIntervalMs: 2,
        totalBudgetMs: 1000, // ample budget; the reclaim should land well inside it
      });

      expect(result).toEqual({
        type: 'own',
        token: 'token-b',
        record: expect.objectContaining({ userMessageId: 'user-2' }),
      });
      expect(acquireStreamIdempotencyLock).toHaveBeenCalledTimes(3);
    });

    it('gives up once the total wait budget is exhausted, carrying the last-seen record', async () => {
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(
        found({
          chatId: 'chat-3',
          userMessageId: 'user-3',
          truncated: false,
          removedCount: 0,
        }),
      );
      (acquireStreamIdempotencyLock as jest.Mock).mockResolvedValue(null);

      const result = await resolveIdempotentSend('user-1', 'key-4', FAST_OPTIONS);

      expect(result.type).toBe('give-up');
      expect(result.record).toEqual(
        expect.objectContaining({ userMessageId: 'user-3' }),
      );
    });

    it('gives up with a null record when nothing was ever available to replay', async () => {
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(notFound());
      (acquireStreamIdempotencyLock as jest.Mock).mockResolvedValue(null);

      const result = await resolveIdempotentSend('user-1', 'key-5', FAST_OPTIONS);

      expect(result).toEqual({ type: 'give-up', record: null });
    });

    it('switches to replay if the record gains an outcome partway through polling', async () => {
      (getStreamIdempotencyRecord as jest.Mock)
        .mockResolvedValueOnce(
          found({
            chatId: 'chat-4',
            userMessageId: 'user-4',
            truncated: false,
            removedCount: 0,
          }),
        )
        .mockResolvedValueOnce(
          found({
            chatId: 'chat-4',
            userMessageId: 'user-4',
            truncated: false,
            removedCount: 0,
            outcome: { kind: 'complete', messageId: 'ai-4', content: 'done', metadata: {} },
          }),
        );
      (acquireStreamIdempotencyLock as jest.Mock).mockResolvedValue(null);

      const result = await resolveIdempotentSend('user-1', 'key-6', {
        pollIntervalMs: 2,
        totalBudgetMs: 1000,
      });

      expect(result.type).toBe('replay');
    });

    it('re-reads after acquiring, so a holder that finishes in that exact gap is not missed', async () => {
      // Regression: acquiring the lock and returning the pre-acquire
      // snapshot would treat an already-completed send (the previous
      // holder finished and released between our read and our acquire) as
      // still-pending, calling the LLM a second time.
      (getStreamIdempotencyRecord as jest.Mock)
        .mockResolvedValueOnce(
          found({
            chatId: 'chat-5',
            userMessageId: 'user-5',
            truncated: false,
            removedCount: 0,
          }),
        )
        .mockResolvedValueOnce(
          found({
            chatId: 'chat-5',
            userMessageId: 'user-5',
            truncated: false,
            removedCount: 0,
            outcome: { kind: 'complete', messageId: 'ai-5', content: 'done', metadata: {} },
          }),
        );
      (acquireStreamIdempotencyLock as jest.Mock).mockResolvedValue({
        token: 'token-c',
      });

      const result = await resolveIdempotentSend('user-1', 'key-7', FAST_OPTIONS);

      expect(result.type).toBe('replay');
      // The lock we acquired but turned out not to need must be released,
      // not left held for its full TTL.
      expect(releaseStreamIdempotencyLock).toHaveBeenCalledWith(
        'user-1',
        'key-7',
        'token-c',
      );
    });

    it('releases the lock and retries rather than proceeding as a fresh send when the post-acquire read fails', async () => {
      // Regression: the pre-acquire read found a real user_persisted
      // record, but the authoritative post-acquire read — the one about to
      // be trusted as "no prior outcome, safe to proceed" — failed. Falling
      // through to `{type:'own', record:null}` here would discard that
      // record and let the caller append a second user message. The lock
      // must be released and the loop must retry instead of guessing.
      (getStreamIdempotencyRecord as jest.Mock)
        .mockResolvedValueOnce(
          found({
            chatId: 'chat-9',
            userMessageId: 'user-9',
            truncated: false,
            removedCount: 0,
          }),
        ) // pre-acquire read, attempt 1
        .mockResolvedValueOnce(lookupError()) // post-acquire read, attempt 1 — fails
        .mockResolvedValueOnce(
          found({
            chatId: 'chat-9',
            userMessageId: 'user-9',
            truncated: false,
            removedCount: 0,
          }),
        ) // pre-acquire read, attempt 2
        .mockResolvedValueOnce(
          found({
            chatId: 'chat-9',
            userMessageId: 'user-9',
            truncated: false,
            removedCount: 0,
          }),
        ); // post-acquire read, attempt 2 — succeeds
      (acquireStreamIdempotencyLock as jest.Mock)
        .mockResolvedValueOnce({ token: 'token-stale' })
        .mockResolvedValueOnce({ token: 'token-good' });

      const result = await resolveIdempotentSend('user-1', 'key-9', {
        pollIntervalMs: 2,
        totalBudgetMs: 1000,
      });

      expect(releaseStreamIdempotencyLock).toHaveBeenCalledWith(
        'user-1',
        'key-9',
        'token-stale',
      );
      expect(result).toEqual({
        type: 'own',
        token: 'token-good',
        record: expect.objectContaining({ userMessageId: 'user-9' }),
      });
    });

    it('treats a record-read error as unknown, never as not-found', async () => {
      // Regression: a Redis blip or corrupted value must not be treated as
      // "no record exists" — that could let a fresh send proceed and
      // overwrite a real (merely unreadable-right-now) record with a
      // duplicate user message once the write lands.
      (getStreamIdempotencyRecord as jest.Mock).mockResolvedValue(
        lookupError(),
      );

      const result = await resolveIdempotentSend('user-1', 'key-8', FAST_OPTIONS);

      // Never proceeds to acquire — and therefore never to a fresh send —
      // while the record's true state is unknown.
      expect(acquireStreamIdempotencyLock).not.toHaveBeenCalled();
      expect(result).toEqual({ type: 'give-up', record: null });
    });
  });
});
