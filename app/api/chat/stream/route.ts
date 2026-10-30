/**
 * Chat Streaming API Endpoint
 * POST /api/chat/stream - Stream AI responses using Server-Sent Events (SSE)
 */

import { NextRequest } from 'next/server';
import { chatMessageSchema } from '@/lib/validation/chat.schema';
import { sanitizeChatMessage } from '@/lib/sanitizer';
import { requireSession } from '@/server/middleware/session';
import { withCsrfProtection } from '@/server/middleware/csrf';
import { withChatRateLimit } from '@/server/middleware/rate-limit';
import {
  badRequest,
  unauthorized,
  forbidden,
  serverError,
} from '@/server/api-response';
import { logError, logInfo, logWarn } from '@/utils/logger';

/**
 * SECURITY (MED-04): Validate request origin for SSE endpoint
 */
function validateOrigin(request: NextRequest): {
  valid: boolean;
  error?: Response;
} {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  // If no origin header, this might be a same-origin request
  if (!origin) {
    return { valid: true };
  }

  // Get allowed origins from environment or use host as default
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  const allowedOrigins = allowedOriginsEnv
    ? allowedOriginsEnv.split(',').map((o) => o.trim())
    : [];

  // Always allow the host itself (same-origin)
  if (host) {
    allowedOrigins.push(`https://${host}`);
    allowedOrigins.push(`http://${host}`);
    // Also allow localhost variants in development
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push('http://localhost:3000');
      allowedOrigins.push('http://127.0.0.1:3000');
    }
  }

  if (!allowedOrigins.includes(origin)) {
    logWarn('SSE request from invalid origin', { origin, allowedOrigins });
    return {
      valid: false,
      error: forbidden('Invalid origin'),
    };
  }

  return { valid: true };
}
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
  STREAM_IDEMPOTENCY_LOCK_TTL_SECONDS,
  type StreamIdempotencyRecord,
  type StreamIdempotencyOutcome,
} from '@/lib/redis/chat';
import {
  callLLMStreamWithRetry,
  truncateMessagesToFit,
  getFallbackMessage,
  getCircuitBreaker,
} from '@/lib/llm/service';
import type { ChatModel, MessageModel } from '@/types/models';

const TITLE_MAX_LENGTH = 50;
const CONTEXT_MAX_TOKENS = 8000;
const HEARTBEAT_FREQUENCY = 10;
const LLM_STREAM_MAX_TOKENS = 2000;
const LLM_STREAM_TEMPERATURE = 0.7;

// How long a request without the lock will wait/poll for the current
// holder to finish, before giving up and responding with a terminal error.
// Must stay >= the lock's own TTL (with margin for poll granularity): a
// lock genuinely abandoned by a crash right after acquisition only
// becomes reclaimable once its lease naturally expires, and this loop
// re-attempts acquisition every tick — so if this budget were *shorter*
// than the TTL, a crash-right-after-acquire could never be reclaimed by an
// automatic retry at all (the client's own retry budget is exhausted long
// before the lock would ever free up). 20s budget vs. a 15s TTL leaves a
// full poll-interval's worth of margin past the worst case (TTL elapsed,
// wait one more tick to observe it).
const IDEMPOTENCY_POLL_INTERVAL_MS = 500;
const IDEMPOTENCY_POLL_TOTAL_BUDGET_MS = 20_000;
// Renew the lock lease on an independent interval — not gated on LLM chunk
// arrival. A provider that hangs before producing any output would
// otherwise never renew at all, since the previous chunk-gated approach
// only ran from inside the token callback. Three renewal attempts per
// lease period gives margin against a single slow/failed renewal call
// still landing well before the TTL lapses.
const IDEMPOTENCY_LOCK_RENEW_INTERVAL_MS =
  (STREAM_IDEMPOTENCY_LOCK_TTL_SECONDS * 1000) / 3;

const SSE_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // Disable nginx buffering
} as const;

function sseStreamResponse(stream: ReadableStream): Response {
  return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
}

function sseEventFrame(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

/**
 * The stored outcome discriminant ('complete' | 'fallback') is not the wire
 * event name — a normal completion's SSE event is 'message_complete', not
 * 'complete'. The client's dispatch switches on the literal event name, so
 * sending the discriminant unmapped would silently match nothing (falls
 * into `default: break`) with no visible symptom. Centralized here since
 * two call sites need the same mapping and got out of sync once already.
 */
function outcomeEventFrame(
  record: StreamIdempotencyRecord,
  outcome: StreamIdempotencyOutcome,
): Uint8Array {
  const eventName =
    outcome.kind === 'complete' ? 'message_complete' : 'fallback';
  return sseEventFrame(eventName, {
    messageId: outcome.messageId,
    // 'message_complete' reads `content`, 'fallback' reads `message` —
    // both included so the same payload replays correctly either way.
    content: outcome.content,
    message: outcome.content,
    metadata: outcome.metadata,
    chatId: record.chatId,
  });
}

/**
 * Replay an already-completed logical send without touching Redis writes or
 * the LLM again — the safe response to a retry that arrives after the
 * original attempt fully finished.
 */
function buildReplayStream(record: StreamIdempotencyRecord): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        sseEventFrame('message_created', {
          messageId: record.userMessageId,
          chatId: record.chatId,
          truncated: record.truncated,
          removedCount: record.removedCount,
        }),
      );
      if (record.outcome) {
        controller.enqueue(outcomeEventFrame(record, record.outcome));
      }
      controller.close();
    },
  });
}

/**
 * The lock could not be acquired even after polling for it — the current
 * holder is still legitimately working (renewing its lease) past our wait
 * budget, or something failed in a way that left no trace to recover. If we
 * at least know the user message's identity, replay `message_created` so
 * the echo reconciles; either way, end with an ordinary `error` event,
 * which is this endpoint's only defined failure signal (see the
 * `resolveIdempotentSend` doc comment for why a distinct SSE event or HTTP
 * status wasn't added instead).
 */
function buildGiveUpStream(record: StreamIdempotencyRecord | null): ReadableStream {
  return new ReadableStream({
    start(controller) {
      if (record) {
        controller.enqueue(
          sseEventFrame('message_created', {
            messageId: record.userMessageId,
            chatId: record.chatId,
            truncated: record.truncated,
            removedCount: record.removedCount,
          }),
        );
      }
      controller.enqueue(
        sseEventFrame('error', {
          message:
            'Still processing your previous message. Please wait a moment and try again.',
        }),
      );
      controller.close();
    },
  });
}

export type IdempotentSendResolution =
  | { type: 'replay'; record: StreamIdempotencyRecord }
  | { type: 'own'; token: string; record: StreamIdempotencyRecord | null }
  | { type: 'give-up'; record: StreamIdempotencyRecord | null };

export interface ResolveIdempotentSendOptions {
  pollIntervalMs?: number;
  totalBudgetMs?: number;
}

/**
 * Resolve what this request should do about a given idempotency key: replay
 * a completed result, take ownership (fresh or resuming an abandoned prior
 * attempt), or give up.
 *
 * This polls and blocks *before returning any HTTP response* rather than
 * opening the SSE stream immediately and polling inside it. That trades a
 * more typical SSE UX (connection opens right away) for a much simpler
 * implementation — the alternative means restructuring chat/message
 * resolution to live inside the stream body, able to transition from
 * "waiting" to "actively generating" mid-stream. Given lock contention is
 * the rare path (not every send), and the wait budget stays well under
 * common gateway idle-timeouts, this was the more defensible use of time.
 *
 * Every poll tick re-attempts acquisition, not just re-reads the record —
 * so a lock abandoned by a crashed holder gets reclaimed as soon as its TTL
 * lapses, not just when our budget runs out.
 *
 * The record is re-read *after* acquiring the lock, not just before: the
 * previous holder can finish (store its outcome) and release in the exact
 * gap between our pre-acquire read and the moment we actually acquire —
 * acting on the stale pre-acquire snapshot in that case would treat an
 * already-completed send as still-pending and call the LLM a second time.
 *
 * A record-read failure is treated as "unknown", never as "not found" —
 * see `getStreamIdempotencyRecord`'s doc comment. Acquiring the lock and
 * proceeding as a fresh send while we simply couldn't confirm whether a
 * record already exists would risk exactly the duplication this whole
 * mechanism exists to prevent, so a read error skips the acquire attempt
 * for that tick entirely rather than treating the uncertainty as clear.
 *
 * Exported (with injectable timing) specifically so its polling/reclaim
 * logic can be unit-tested with real millisecond-scale delays instead of
 * `jest.useFakeTimers()`: Node's native `ReadableStream` implementation
 * does not play well with Jest's fake timers (observed hanging and
 * eventually exhausting the heap in a real run of this suite), so any test
 * exercising this loop through a real SSE response body has to avoid that
 * combination — using genuinely tiny timing values here instead.
 */
export async function resolveIdempotentSend(
  userId: string,
  idempotencyKey: string,
  options: ResolveIdempotentSendOptions = {},
): Promise<IdempotentSendResolution> {
  const pollIntervalMs = options.pollIntervalMs ?? IDEMPOTENCY_POLL_INTERVAL_MS;
  const totalBudgetMs = options.totalBudgetMs ?? IDEMPOTENCY_POLL_TOTAL_BUDGET_MS;
  const deadline = Date.now() + totalBudgetMs;

  while (true) {
    const lookup = await getStreamIdempotencyRecord(userId, idempotencyKey);

    if (lookup.status === 'found' && lookup.record.outcome) {
      return { type: 'replay', record: lookup.record };
    }

    if (lookup.status !== 'error') {
      const lock = await acquireStreamIdempotencyLock(userId, idempotencyKey);
      if (lock) {
        const postAcquireLookup = await getStreamIdempotencyRecord(
          userId,
          idempotencyKey,
        );

        if (
          postAcquireLookup.status === 'found' &&
          postAcquireLookup.record.outcome
        ) {
          // The previous holder finished and released between our two
          // reads — nothing for us to do with the lock we just acquired.
          await releaseStreamIdempotencyLock(
            userId,
            idempotencyKey,
            lock.token,
          );
          return { type: 'replay', record: postAcquireLookup.record };
        }

        if (postAcquireLookup.status === 'error') {
          // This second read is the *authoritative* one — it's what we're
          // about to act on as "no prior outcome, safe to proceed" — and it
          // just failed. The pre-acquire `lookup` may well have found a
          // real `user_persisted` record; falling through to `record: null`
          // here would discard that and let the caller append a second
          // user message. Release the lock we can't safely use yet and let
          // the loop retry the read, rather than guessing.
          await releaseStreamIdempotencyLock(
            userId,
            idempotencyKey,
            lock.token,
          );
        } else {
          return {
            type: 'own',
            token: lock.token,
            record:
              postAcquireLookup.status === 'found'
                ? postAcquireLookup.record
                : null,
          };
        }
      }
    }

    if (Date.now() >= deadline) {
      return {
        type: 'give-up',
        record: lookup.status === 'found' ? lookup.record : null,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

async function processChatStream(request: NextRequest) {
  // SECURITY (MED-04): Validate origin before processing
  const originCheck = validateOrigin(request);
  if (!originCheck.valid && originCheck.error) {
    return originCheck.error;
  }

  // Hoisted above the try block (not just declared inside it) so the catch
  // block below can still see them: `let`/`const` declared inside `try` are
  // not visible in the paired `catch`, and a lock acquired here must be
  // released even when something throws before the SSE stream — whose own
  // `finally` handles the rest — is ever constructed.
  let lockTokenForCleanup: string | undefined;
  let idempotencyKeyForCleanup: string | undefined;
  let userIdForCleanup: string | undefined;
  // Also hoisted: renewal must start the instant the lock is acquired, not
  // once the SSE stream body starts running (see where it's set below), so
  // it has to survive past the try block the same way the cleanup vars do.
  let renewalTimer: ReturnType<typeof setInterval> | undefined;
  // Tripped by the renewal callback when a renew attempt reports the lock
  // is no longer (confirmedly) ours. `.signal.aborted` is checked before
  // ever calling the LLM and again before the final persist, and is
  // threaded into `callLLMStreamWithRetry` so a loss mid-call actually
  // stops the provider stream rather than just being ignored once it
  // resolves. Google's SDK documents `abortSignal` as client-only — it
  // stops *this process* reading/relaying further output, not generation
  // on their side, and doesn't guarantee the call isn't billed — so this
  // narrows the exposure window but can't fully eliminate duplicate
  // provider-side cost.
  let lockAbortController: AbortController | undefined;

  try {
    // Require authenticated session
    const session = await requireSession(request);
    userIdForCleanup = session.userId;

    // Parse and validate request body
    const body = await request.json();
    const validation = chatMessageSchema.safeParse(body);

    if (!validation.success) {
      return badRequest('Invalid request', {
        errors: validation.error.errors,
      });
    }

    const {
      content,
      chatId: requestedChatId,
      parentMessageId,
      idempotencyKey,
    } = validation.data;
    const sanitizedContent = sanitizeChatMessage(content);

    // Idempotency: the user message is persisted before any SSE bytes are
    // sent (below), so a client retry that never received `message_created`
    // cannot tell "never reached the server" apart from "reached it, ack
    // lost" — see the doc comment on StreamIdempotencyRecord. Resolve that
    // ambiguity server-side rather than trusting the client not to resend.
    let lockToken: string | null = null;
    let resumedRecord: StreamIdempotencyRecord | null = null;

    if (idempotencyKey) {
      const resolution = await resolveIdempotentSend(
        session.userId,
        idempotencyKey,
      );

      if (resolution.type === 'replay') {
        return sseStreamResponse(buildReplayStream(resolution.record));
      }
      if (resolution.type === 'give-up') {
        return sseStreamResponse(buildGiveUpStream(resolution.record));
      }

      lockToken = resolution.token;
      lockTokenForCleanup = resolution.token;
      idempotencyKeyForCleanup = idempotencyKey;
      resumedRecord = resolution.record; // user_persisted only, if present

      // Starts here — immediately on acquisition — rather than after chat
      // lookup, history fetch, and user-message persistence have all run.
      // The lock's TTL is short (see STREAM_IDEMPOTENCY_LOCK_TTL_SECONDS)
      // specifically so an abandoned lock is reclaimable quickly; if
      // renewal only began once the SSE stream body started, all of that
      // earlier work would run entirely unrenewed, and a slow Redis round
      // trip or GC pause there could let another request reclaim the lock
      // while this one is still about to persist the user message and call
      // the LLM under it. `lockAbortController` (checked below and inside
      // the stream) is how loss during any of that is acted on.
      const ownedToken = resolution.token;
      lockAbortController = new AbortController();
      renewalTimer = setInterval(() => {
        void renewStreamIdempotencyLock(
          session.userId,
          idempotencyKey,
          ownedToken,
        ).then((renewed) => {
          if (renewed) {
            return;
          }
          // Committed to the lost-lock path here — a renew failure could
          // be either a confirmed token mismatch (someone else reclaimed
          // it) or a transient Redis error, but there's no reliable way to
          // tell those apart from this call's return value alone, so both
          // are treated the same conservative way: stop renewing (no point
          // extending a lease we can no longer certainly claim), abort
          // whatever this request is doing with it, and let go of it
          // immediately rather than let it sit for its full TTL blocking a
          // legitimate new holder while this one winds down. Releasing is
          // a compare-and-delete fenced on our own token, so if we're
          // wrong and still actually own it, worst case is releasing our
          // own lock a little early; if someone else already holds it,
          // this is a safe no-op that never touches their lock.
          if (renewalTimer) {
            clearInterval(renewalTimer);
            renewalTimer = undefined;
          }
          lockAbortController?.abort();
          void releaseStreamIdempotencyLock(
            session.userId,
            idempotencyKey,
            ownedToken,
          );
          logWarn('Lost idempotency lock mid-stream', {
            userId: session.userId,
            idempotencyKey,
          });
        });
      }, IDEMPOTENCY_LOCK_RENEW_INTERVAL_MS);
    }

    // Release the lock (and stop renewing it) on any early `return` between
    // here and the SSE stream actually being constructed — the outer catch
    // only runs on a *thrown* error, not a plain `return`, so the two
    // validation failures just below would otherwise hold the lock (and
    // keep renewing it) for no reason.
    const releaseAcquiredLock = async () => {
      if (renewalTimer) {
        clearInterval(renewalTimer);
        renewalTimer = undefined;
      }
      if (lockToken && idempotencyKey) {
        await releaseStreamIdempotencyLock(
          session.userId,
          idempotencyKey,
          lockToken,
        );
      }
    };

    // Get or create chat, and resolve the user message — resuming a prior
    // attempt's identity when one exists, rather than creating a new one.
    let chat: ChatModel | null = null;
    if (requestedChatId) {
      const chatLookup = await getChatLookup(requestedChatId);
      if (chatLookup.status === 'error') {
        // Can't tell "genuinely doesn't exist" from "Redis blip" — treating
        // this as not-found would let the request fall through to creating
        // a brand-new chat under a real chatId the client already knows
        // about. Fail closed and ask the client to retry instead of
        // guessing.
        await releaseAcquiredLock();
        return serverError(
          'Could not verify the requested chat right now. Please retry.',
        );
      }
      if (chatLookup.status === 'found') {
        chat = chatLookup.chat;
      }
    }

    if (requestedChatId && !chat) {
      await releaseAcquiredLock();
      return badRequest('Chat not found');
    }

    if (chat && chat.userId !== session.userId) {
      await releaseAcquiredLock();
      return unauthorized('You do not have access to this chat');
    }

    if (resumedRecord) {
      const resumedChatLookup = await getChatLookup(resumedRecord.chatId);
      if (resumedChatLookup.status === 'error') {
        // The idempotency record says a prior attempt persisted a real
        // user message into this chat — treating an unreadable lookup as
        // "the chat is gone" (like the not-found case below, correctly,
        // does) would risk exactly the duplication idempotency exists to
        // prevent: the chat may well still be there, we just failed to
        // confirm it this attempt. Fail closed rather than guess.
        await releaseAcquiredLock();
        return serverError(
          'Could not verify your previous message right now. Please retry.',
        );
      }
      if (
        resumedChatLookup.status === 'not_found' ||
        resumedChatLookup.chat.userId !== session.userId
      ) {
        // The chat this attempt persisted into is genuinely gone (TTL
        // expired, deleted) — nothing sensible to resume. Fall through to
        // a fresh send instead; we still own the lock, so this is safe.
        resumedRecord = null;
      } else {
        chat = resumedChatLookup.chat;
      }
    }

    if (!chat) {
      const title =
        sanitizedContent.slice(0, TITLE_MAX_LENGTH) +
        (sanitizedContent.length > TITLE_MAX_LENGTH ? '...' : '');
      chat = await createChat(session.userId, title);
    }

    // Get chat history — the most recent messages, not the oldest. A
    // head-first page (offset 0) would, in any chat exceeding one page,
    // both starve the LLM of recent context and — critically for the
    // resume path just below — never contain the just-appended message
    // it's trying to confirm, since new messages land at the tail.
    const chatHistoryLookup = await getRecentChatMessagesLookup(chat.id);
    if (chatHistoryLookup.status === 'error' && resumedRecord) {
      // Resuming specifically needs to know whether the record's
      // `userMessageId` is really there — an unreadable history means we
      // can't confirm that, and proceeding either risks generating a reply
      // from incomplete context or (see below) trusting a parentMessageId
      // reference we never actually verified. A fresh send tolerates this
      // same failure by falling back to an empty history further down;
      // resuming can't, because it has a specific prior message to verify
      // rather than just "whatever history exists."
      await releaseAcquiredLock();
      return serverError(
        'Could not verify your previous message right now. Please retry.',
      );
    }
    const chatHistory =
      chatHistoryLookup.status === 'found' ? chatHistoryLookup.messages : [];

    // When resuming, the user message *should* already be in `chatHistory`
    // (a prior attempt persisted it) — but `getChatMessages` converts a
    // Redis read/parse failure into an empty array, indistinguishable here
    // from "chat genuinely has no history yet". Trusting that blindly would
    // let a transient read failure silently drop the user's prompt from the
    // LLM call entirely — the model still replies to *something*, and that
    // reply gets saved as a normal successful outcome, with no trace that
    // the prompt it answered was empty. Verify the assumption instead of
    // relying on it: if the resumed message isn't actually present, fall
    // back to appending the request's own content, exactly as a fresh send
    // does. The content is available locally on every attempt regardless of
    // Redis's state, so this is a reliable safety net rather than another
    // read that could itself fail the same way.
    const resumedMessageConfirmedPresent =
      resumedRecord !== null &&
      chatHistory.some((msg) => msg.id === resumedRecord.userMessageId);

    const allMessages = resumedMessageConfirmedPresent
      ? chatHistory.map((msg) => ({ role: msg.role, content: msg.content }))
      : [
          ...chatHistory.map((msg) => ({ role: msg.role, content: msg.content })),
          { role: 'user', content: sanitizedContent },
        ];

    const {
      messages: truncatedMessages,
      truncated,
      removedCount,
    } = truncateMessagesToFit(allMessages, CONTEXT_MAX_TOKENS);

    if (truncated) {
      logWarn('Context truncated for streaming request', {
        chatId: chat.id,
        removedCount,
        originalCount: allMessages.length,
        keptCount: truncatedMessages.length,
      });
    }

    let userMessageId: string;

    if (resumedRecord) {
      userMessageId = resumedRecord.userMessageId;

      if (!resumedMessageConfirmedPresent) {
        // The idempotency record says this ID is already a persisted user
        // message, but the (successfully read, per the check above)
        // history genuinely doesn't contain it. The LLM context above
        // already falls back to the request's own content, but that
        // doesn't fix the *stored* side: without this, the assistant
        // reply saved below would carry a `parentMessageId` pointing at a
        // row that was never actually written, and the reply itself would
        // have been generated without whatever real prior conversation
        // this chat has. Restore it under its original ID — fenced on the
        // same lock token as everything else here, so a request that's
        // since lost the lock can't win this race either.
        const restoredUserMessage: MessageModel = {
          id: userMessageId,
          chatId: chat.id,
          role: 'user',
          content: sanitizedContent,
          status: 'sent',
          parentMessageId: parentMessageId || null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        if (lockToken && idempotencyKey) {
          const restored = await persistMessageWithIdempotencyRecord(
            chat.id,
            restoredUserMessage,
            session.userId,
            idempotencyKey,
            { chatId: chat.id, userMessageId, truncated, removedCount },
            lockToken,
          );
          if (!restored) {
            throw new Error(
              'Failed to restore missing user message during resume',
            );
          }
        } else {
          // `resumedRecord` only exists when this attempt also has a
          // lockToken/idempotencyKey (see where it's set, above) — this
          // branch is unreachable in practice, kept only for type safety
          // and to match every other persist call site's shape here.
          const restored = await addMessage(chat.id, restoredUserMessage);
          if (!restored) {
            throw new Error(
              'Failed to restore missing user message during resume',
            );
          }
        }
      }
    } else {
      // SECURITY (LOW-04): Use crypto.randomUUID for secure IDs
      userMessageId = `msg_${crypto.randomUUID()}`;
      const userMessage: MessageModel = {
        id: userMessageId,
        chatId: chat.id,
        role: 'user',
        content: sanitizedContent,
        status: 'sent',
        parentMessageId: parentMessageId || null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (lockToken && idempotencyKey) {
        // Atomic: the message and the progress record land together or not
        // at all — see persistMessageWithIdempotencyRecord's doc comment.
        // Recorded immediately, before the LLM call, so a concurrent
        // request that loses the lock race can still replay
        // `message_created` from this rather than having nothing to
        // reconcile the echo against.
        const persisted = await persistMessageWithIdempotencyRecord(
          chat.id,
          userMessage,
          session.userId,
          idempotencyKey,
          { chatId: chat.id, userMessageId, truncated, removedCount },
          lockToken,
        );
        if (!persisted) {
          throw new Error('Failed to persist user message');
        }
      } else {
        const persisted = await addMessage(chat.id, userMessage);
        if (!persisted) {
          throw new Error('Failed to persist user message');
        }
      }
    }

    const finalChat = chat;
    const finalUserMessageId = userMessageId;
    const finalLockToken = lockToken;
    const finalLockAbortController = lockAbortController;

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(sseEventFrame(event, data));
        };

        const sendHeartbeat = () => {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
        };

        // Send initial message confirmation
        sendEvent('message_created', {
          messageId: finalUserMessageId,
          chatId: finalChat.id,
          truncated,
          removedCount,
        });

        // SECURITY (LOW-04): Use crypto.randomUUID for secure IDs
        const aiMessageId = `msg_${crypto.randomUUID()}`;
        let accumulatedContent = '';
        let heartbeatCount = 0;

        try {
          // A known-lost owner has nothing safe left to do: neither
          // persist path below can land (the fence rejects both once this
          // lock is gone), so don't call the LLM or attempt a fallback
          // persist at all if loss was already confirmed before we even
          // got here — e.g. during chat lookup, history fetch, or
          // user-message persistence, all of which ran before this point.
          if (finalLockAbortController?.signal.aborted) {
            sendEvent('error', {
              message:
                'Lost the idempotency lock before a response could be generated; please retry.',
              error: 'lock_lost',
            });
            return;
          }

          // Check circuit breaker state
          const circuitBreaker = getCircuitBreaker();
          const circuitState = circuitBreaker.getState();

          if (circuitState === 'OPEN') {
            // Circuit is open, send fallback message immediately
            const fallbackMsg = getFallbackMessage();
            accumulatedContent = fallbackMsg;
            const fallbackMetadata = {
              model: 'fallback',
              tokensUsed: 0,
              processingTime: 0,
              circuitBreakerOpen: true,
            };

            // Persist fallback message to database
            const aiMessage: MessageModel = {
              id: aiMessageId,
              chatId: finalChat.id,
              role: 'assistant',
              content: accumulatedContent,
              status: 'sent',
              parentMessageId: finalUserMessageId,
              metadata: fallbackMetadata,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const outcome: StreamIdempotencyOutcome = {
              kind: 'fallback',
              messageId: aiMessageId,
              content: accumulatedContent,
              metadata: fallbackMetadata,
            };

            if (finalLockToken && idempotencyKey) {
              // The lock we'd be fencing this write against is no longer
              // (confirmedly) ours — the fence would reject the write
              // anyway, but skip the round trip and tell the client
              // plainly rather than surfacing it as a generic persist
              // failure.
              if (finalLockAbortController?.signal.aborted) {
                sendEvent('error', {
                  message:
                    'Lost the idempotency lock before the fallback message could be saved; please retry.',
                  error: 'lock_lost',
                });
                return;
              }
              const persisted = await persistMessageWithIdempotencyRecord(
                finalChat.id,
                aiMessage,
                session.userId,
                idempotencyKey,
                {
                  chatId: finalChat.id,
                  userMessageId: finalUserMessageId,
                  truncated,
                  removedCount,
                  outcome,
                },
                finalLockToken,
              );
              if (!persisted) {
                throw new Error('Failed to persist fallback message');
              }
            } else {
              const persisted = await addMessage(finalChat.id, aiMessage);
              if (!persisted) {
                throw new Error('Failed to persist fallback message');
              }
            }

            sendEvent('fallback', {
              messageId: aiMessageId,
              message: fallbackMsg,
              metadata: fallbackMetadata,
              chatId: finalChat.id,
            });

            logWarn('Circuit breaker open - sent fallback message', {
              chatId: finalChat.id,
              userId: session.userId,
            });
          } else {
            // Stream LLM response
            const startTime = Date.now();

            const response = await callLLMStreamWithRetry(
              truncatedMessages,
              (chunk: string) => {
                // Once the lock is confirmed lost, stop relaying and stop
                // growing a transcript that's about to be discarded anyway
                // (see the persist-time check below, which is what
                // actually prevents the duplicate-save). The `signal`
                // passed below is what stops the provider call itself —
                // this guard covers the gap between abort firing and the
                // stream actually winding down.
                if (finalLockAbortController?.signal.aborted) {
                  return;
                }

                accumulatedContent += chunk;
                heartbeatCount++;

                sendEvent('content_delta', {
                  messageId: aiMessageId,
                  delta: chunk,
                  accumulatedContent,
                });

                // Send heartbeat periodically
                if (heartbeatCount % HEARTBEAT_FREQUENCY === 0) {
                  sendHeartbeat();
                }
                // Lock renewal runs on its own independent interval (started
                // at acquisition time, above) rather than here.
              },
              {
                maxTokens: LLM_STREAM_MAX_TOKENS,
                temperature: LLM_STREAM_TEMPERATURE,
                signal: finalLockAbortController?.signal,
              },
            );

            const processingTime = Date.now() - startTime;

            // Save complete AI message
            const aiMessage: MessageModel = {
              id: aiMessageId,
              chatId: finalChat.id,
              role: 'assistant',
              content: accumulatedContent,
              status: 'sent',
              parentMessageId: finalUserMessageId,
              metadata: {
                model: response.model,
                tokensUsed: response.tokensUsed,
                processingTime,
                contextTruncated: truncated,
                messagesRemoved: truncated ? removedCount : undefined,
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const outcome: StreamIdempotencyOutcome = {
              kind: 'complete',
              messageId: aiMessageId,
              content: accumulatedContent,
              metadata: aiMessage.metadata,
            };

            if (finalLockToken && idempotencyKey) {
              // Same rationale as the fallback branch above: the fence
              // would reject this write anyway once the lock's gone, so
              // don't bother attempting it — and tell the client plainly
              // instead of letting it read as a generic persist failure.
              if (finalLockAbortController?.signal.aborted) {
                sendEvent('error', {
                  message:
                    'Lost the idempotency lock before the response could be saved; please retry.',
                  error: 'lock_lost',
                });
                return;
              }
              const persisted = await persistMessageWithIdempotencyRecord(
                finalChat.id,
                aiMessage,
                session.userId,
                idempotencyKey,
                {
                  chatId: finalChat.id,
                  userMessageId: finalUserMessageId,
                  truncated,
                  removedCount,
                  outcome,
                },
                finalLockToken,
              );
              if (!persisted) {
                throw new Error('Failed to persist assistant message');
              }
            } else {
              const persisted = await addMessage(finalChat.id, aiMessage);
              if (!persisted) {
                throw new Error('Failed to persist assistant message');
              }
            }

            // Send completion event
            sendEvent('message_complete', {
              messageId: aiMessageId,
              content: accumulatedContent,
              metadata: aiMessage.metadata,
            });

            logInfo('Streaming completed', {
              chatId: finalChat.id,
              userId: session.userId,
              messageId: aiMessageId,
              tokensUsed: response.tokensUsed,
              processingTime,
            });
          }
        } catch (error) {
          logError('Streaming error', error);

          // Check if circuit breaker is now open
          const isCircuitOpen =
            error instanceof Error &&
            error.message.includes('Circuit breaker is OPEN');

          if (isCircuitOpen) {
            // Send fallback message
            const fallbackMsg = getFallbackMessage();
            const fallbackMetadata = {
              model: 'fallback',
              tokensUsed: 0,
              processingTime: 0,
              circuitBreakerOpen: true,
            };
            sendEvent('fallback', {
              messageId: aiMessageId,
              message: fallbackMsg,
              metadata: fallbackMetadata,
              chatId: finalChat.id,
            });
          } else if (finalLockAbortController?.signal.aborted) {
            // The thrown error here is `callLLMStreamWithRetry` reacting to
            // the abort signal mid-call (rather than the pre-invocation or
            // pre-persist checks catching the loss first) — same
            // condition, just caught at a different point in the flow.
            // Surface the same clear reason either way, not a generic one.
            sendEvent('error', {
              message:
                'Lost the idempotency lock while generating a response; please retry.',
              error: 'lock_lost',
            });
          } else {
            sendEvent('error', {
              message: 'Failed to generate response',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
          // No outcome stored here on purpose: the user_persisted record
          // (already saved above) stays as-is, so a future retry resumes
          // from "user message exists, reply still needed" instead of
          // either duplicating the user message or replaying a failure.
        } finally {
          if (renewalTimer) {
            clearInterval(renewalTimer);
          }
          if (finalLockToken && idempotencyKey) {
            await releaseStreamIdempotencyLock(
              session.userId,
              idempotencyKey,
              finalLockToken,
            );
          }
          controller.close();
        }
      },
    });

    return sseStreamResponse(stream);
  } catch (error) {
    logError('Stream API error', error);

    // The stream body's own `finally` (above) releases the lock for every
    // failure that happens once the stream is constructed and returned —
    // this catch never runs for those (the `start()` callback runs
    // asynchronously after the Response is already returned, detached from
    // this function's control flow). This handles the other case: a lock
    // acquired above but something throwing before the stream was ever
    // built (session/validation/getChat/createChat/persist). Without this,
    // that lock would sit held for its full TTL despite nothing actually
    // being in progress. Renewal was started (above) the instant the lock
    // was acquired, so it also needs stopping here on this same path.
    if (renewalTimer) {
      clearInterval(renewalTimer);
    }
    if (lockTokenForCleanup && idempotencyKeyForCleanup && userIdForCleanup) {
      await releaseStreamIdempotencyLock(
        userIdForCleanup,
        idempotencyKeyForCleanup,
        lockTokenForCleanup,
      );
    }

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return unauthorized();
    }

    return badRequest('Failed to initialize stream');
  }
}

/**
 * POST /api/chat/stream
 * Validates CSRF before applying chat-specific rate limiting.
 */
export async function POST(request: NextRequest) {
  const csrfCheck = await withCsrfProtection(request);
  if (!csrfCheck.valid && csrfCheck.error) {
    return csrfCheck.error;
  }

  const limitedHandler = withChatRateLimit(processChatStream);
  return limitedHandler(request);
}
