/**
 * Chat Data Layer
 * Redis-based storage for chats and messages
 */

import { z } from 'zod';
import { getRedisClient } from './client';
import { chatKey, chatMessagesKey, userChatsKey } from './keys';
import type { ChatModel, MessageModel } from '@/types/models';
import { logError, logWarn } from '@/utils/logger';
import { withTransaction, txSet, txSAdd } from './transactions';

const CHAT_TTL = 30 * 24 * 60 * 60; // 30 days

/**
 * Create a new chat
 */
export async function createChat(
  userId: string,
  title: string = 'New Chat'
): Promise<ChatModel> {
  // SECURITY (LOW-04): Use crypto.randomUUID for secure IDs — matches the
  // message ID generation in the chat route handlers. A timestamp+Math.random
  // ID is guessable, and chat IDs appear in URLs and API paths.
  const chatId = `chat_${crypto.randomUUID()}`;

  const chat: ChatModel = {
    id: chatId,
    userId,
    title,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return await withTransaction(async (ctx) => {
    // Save chat
    await txSet(ctx, chatKey(chatId), JSON.stringify(chat), CHAT_TTL);

    // Add to user's chat list
    await txSAdd(ctx, userChatsKey(userId), chatId);

    return chat;
  });
}

export type ChatLookup =
  | { status: 'found'; chat: ChatModel }
  | { status: 'not_found' }
  | { status: 'error' };

/**
 * Tri-state variant of `getChat`, for callers where "not found" and "Redis
 * blip" must not be conflated — most importantly the chat-stream route's
 * resume path, where treating a transient read failure as "chat deleted"
 * would fall through to processing a fresh send and risk duplicating a
 * turn (or its reply) that a real, still-existing chat is waiting on. Plain
 * `getChat` below stays the right choice wherever that distinction doesn't
 * matter and collapsing to `null` is fine.
 */
export async function getChatLookup(chatId: string): Promise<ChatLookup> {
  const redis = getRedisClient();

  let data: string | null;
  try {
    data = await redis.get(chatKey(chatId));
  } catch (error) {
    logError('Failed to get chat', error, { chatId });
    return { status: 'error' };
  }

  if (!data) {
    return { status: 'not_found' };
  }

  try {
    const chat = JSON.parse(data);
    // Hydrate dates
    chat.createdAt = new Date(chat.createdAt);
    chat.updatedAt = new Date(chat.updatedAt);
    return { status: 'found', chat: chat as ChatModel };
  } catch (error) {
    logError('Failed to parse chat', error, { chatId });
    return { status: 'error' };
  }
}

/**
 * Get chat by ID
 */
export async function getChat(chatId: string): Promise<ChatModel | null> {
  const lookup = await getChatLookup(chatId);
  return lookup.status === 'found' ? lookup.chat : null;
}

/**
 * Update chat
 */
export async function updateChat(
  chatId: string,
  updates: Partial<ChatModel>
): Promise<boolean> {
  const redis = getRedisClient();

  try {
    const chat = await getChat(chatId);
    if (!chat) return false;

    const updatedChat = {
      ...chat,
      ...updates,
      updatedAt: new Date(),
    };

    await redis.setex(
      chatKey(chatId),
      CHAT_TTL,
      JSON.stringify(updatedChat)
    );

    return true;
  } catch (error) {
    logError('Failed to update chat', error, { chatId });
    return false;
  }
}

/**
 * Delete chat
 */
export async function deleteChat(chatId: string): Promise<boolean> {
  const redis = getRedisClient();

  try {
    const chat = await getChat(chatId);
    if (!chat) return false;

    // Delete chat
    await redis.del(chatKey(chatId));

    // Remove from user's chat list
    await redis.srem(userChatsKey(chat.userId), chatId);

    // Delete all messages
    await redis.del(chatMessagesKey(chatId));

    return true;
  } catch (error) {
    logError('Failed to delete chat', error, { chatId });
    return false;
  }
}

/**
 * Get user's chats
 */
export async function getUserChats(userId: string): Promise<ChatModel[]> {
  const redis = getRedisClient();

  try {
    const chatIds = await redis.smembers(userChatsKey(userId));
    if (chatIds.length === 0) return [];

    const keys = chatIds.map((id) => chatKey(id));
    const results = await redis.mget(keys);

    const chats: ChatModel[] = [];

    results.forEach((raw) => {
      if (!raw) return;
      try {
        const chat = JSON.parse(raw);
        chat.createdAt = new Date(chat.createdAt);
        chat.updatedAt = new Date(chat.updatedAt);
        chats.push(chat);
      } catch {
        // Skip invalid entries
      }
    });

    // Sort by updatedAt descending
    chats.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return chats;
  } catch (error) {
    logError('Failed to get user chats', error, { userId });
    return [];
  }
}

/**
 * Add message to chat
 */
export async function addMessage(
  chatId: string,
  message: MessageModel
): Promise<boolean> {
  const redis = getRedisClient();

  try {
    // Add message to chat messages list
    await redis.rpush(chatMessagesKey(chatId), JSON.stringify(message));

    // Update chat's updatedAt
    await updateChat(chatId, { updatedAt: new Date() });

    return true;
  } catch (error) {
    logError('Failed to add message', error, { chatId, messageId: message.id });
    return false;
  }
}

export type ChatMessagesLookup =
  | { status: 'found'; messages: MessageModel[] }
  | { status: 'error' };

/**
 * Shared by every "read a range of this chat's messages" lookup below —
 * `start`/`stop` are passed straight through to `LRANGE`, so negative
 * indices (counting from the tail) work exactly as Redis defines them.
 */
async function lookupMessagesInRange(
  chatId: string,
  start: number,
  stop: number,
): Promise<ChatMessagesLookup> {
  const redis = getRedisClient();

  try {
    const messages = await redis.lrange(chatMessagesKey(chatId), start, stop);

    return {
      status: 'found',
      messages: messages.map((raw) => {
        const message = JSON.parse(raw);
        message.createdAt = new Date(message.createdAt);
        message.updatedAt = new Date(message.updatedAt);
        return message as MessageModel;
      }),
    };
  } catch (error) {
    logError('Failed to get chat messages', error, { chatId, start, stop });
    return { status: 'error' };
  }
}

/**
 * Tri-state variant of `getChatMessages` — a read failure returns
 * `status: 'error'` instead of silently degrading to an empty list, for
 * callers where "this chat genuinely has no history" and "we couldn't read
 * its history right now" must not be conflated. Most importantly the
 * chat-stream route's resume path: trusting an empty result there could
 * mean either dropping a real prior conversation from the LLM's context, or
 * — worse — proceeding to save a reply whose `parentMessageId` references a
 * user message we never actually confirmed exists. Plain `getChatMessages`
 * below stays the right choice wherever "no history" and "unreadable right
 * now" can be treated the same.
 *
 * Paginates from the *head* (oldest first) — offset 0 is the chat's first
 * message. Fine for a UI paging forward through history from the start, but
 * wrong for anything that cares about *recent* messages: in a chat with
 * more than `limit` messages, this page never reaches the end. Use
 * `getRecentChatMessagesLookup` instead wherever what's needed is "what's
 * been said lately," not "page N of the full history."
 */
export async function getChatMessagesLookup(
  chatId: string,
  offset: number = 0,
  limit: number = 100,
): Promise<ChatMessagesLookup> {
  return lookupMessagesInRange(chatId, offset, offset + limit - 1);
}

/**
 * The most recent `limit` messages — the tail of the list, via `LRANGE`'s
 * negative indices, rather than `getChatMessagesLookup`'s head-first
 * pagination. Exists specifically because the chat-stream route needs two
 * things a head-first page can't reliably give it once a chat exceeds
 * `limit` messages: enough *recent* context to generate a sensible reply,
 * and confirmation that a just-persisted message (necessarily one of the
 * newest, never one of the oldest) is actually there. A head page missing
 * that message looks identical to it genuinely not existing — which was
 * exactly the case this function was added to stop being possible.
 */
export async function getRecentChatMessagesLookup(
  chatId: string,
  limit: number = 100,
): Promise<ChatMessagesLookup> {
  return lookupMessagesInRange(chatId, -limit, -1);
}

/**
 * Get messages for a chat
 */
export async function getChatMessages(
  chatId: string,
  offset: number = 0,
  limit: number = 100
): Promise<MessageModel[]> {
  const lookup = await getChatMessagesLookup(chatId, offset, limit);
  return lookup.status === 'found' ? lookup.messages : [];
}

/**
 * Idempotency for POST /api/chat/stream.
 *
 * The user message is persisted (`addMessage`) before the SSE response is
 * even constructed. If that response — or just the `message_created` event
 * in it — never reaches the client, the client cannot tell "never sent"
 * apart from "sent, ack lost": a `fetch()`/`reader.read()` failure looks
 * identical either way. A client-side retry is therefore unsafe to resolve
 * on its own; the server has to recognize a retried request as the same
 * logical send and avoid re-persisting it or re-billing a second LLM call.
 *
 * `idempotencyKey` is a client-minted ID (the client's optimistic-echo temp
 * ID), stable across a client's own retries of one logical send, unique per
 * new message. Record is a two-phase state: written once the user message
 * is persisted (so a lock-losing concurrent request can at least replay
 * `message_created`), then again once the assistant's reply completes (so
 * a later retry can replay the whole exchange without calling the LLM again).
 *
 * Both phase transitions are written atomically together with the message
 * they describe (`persistMessageWithIdempotencyRecord`, a single Redis
 * MULTI/EXEC batch) rather than as two sequential round trips. Two separate
 * awaited calls leave a real window where a process crash between them
 * orphans the message with no idempotency record — and once the lock
 * expires, nothing distinguishes that from a send that never happened,
 * so a retry duplicates it.
 *
 * The lock itself carries a random per-attempt owner token as its value
 * (not a fixed placeholder like `'processing'`), acquired with a single
 * atomic `SET key token NX EX ttl` rather than separate SETNX+EXPIRE calls
 * (which leave a gap where a crash after SETNX but before EXPIRE creates a
 * lock that never expires). Release and renewal both compare-and-act via a
 * Lua script rather than a plain DEL/EXPIRE: without the token check, a
 * lock that outlived its TTL (a long LLM call) and was re-acquired by a
 * different request could have its lease deleted or extended by the
 * original holder finishing late, stepping on whoever holds it now.
 *
 * The message + record persistence is *fenced* on that same token
 * (`persistMessageWithIdempotencyRecord`'s Lua script), not just guarded by
 * holding the lock at the time the write is issued: renewal can fail to
 * keep up (a slow LLM provider, a missed renewal tick), and without a
 * fence, a holder whose lease already expired — and whose lock a different
 * request has since acquired — could still commit its write, landing two
 * assistant messages and two outcome writes for the same logical send. The
 * fence makes that write atomically conditional on the token still being
 * the current lock value, so a holder that has lost the lock can never
 * commit, no matter how late its own persistence call lands.
 */

const STREAM_IDEMPOTENCY_PREFIX = 'idempotency:stream:';
const STREAM_IDEMPOTENCY_LOCK_PREFIX = 'idempotency:stream:lock:';
const STREAM_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
// Short relative to the old value (was 60s) — deliberately, now that lease
// renewal runs on an independent interval rather than piggybacked on LLM
// chunk arrival (see route.ts), an active request renews well before this
// lapses regardless of whether tokens are flowing. A short TTL means a
// lock genuinely abandoned by a crash (nothing left to renew it) is
// reclaimable quickly, and comfortably within a single server-side poll
// wait — see IDEMPOTENCY_POLL_TOTAL_BUDGET_MS in route.ts, which must stay
// >= this value for that guarantee to hold.
export const STREAM_IDEMPOTENCY_LOCK_TTL_SECONDS = 15;

// Compare-and-delete: only the holder whose token still matches may release.
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

// Compare-and-extend: only the holder whose token still matches may renew.
const RENEW_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("expire", KEYS[1], ARGV[2])
else
  return 0
end
`;

// Fenced write: only the holder whose token still matches the lock may
// persist. Checking and writing in one Lua script closes the gap a
// separate "check, then write" pair would leave open (the lock could be
// stolen in between); Lua scripts run atomically in Redis, so this is a
// true compare-and-commit, not just a check.
const FENCED_PERSIST_SCRIPT = `
if redis.call("get", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("rpush", KEYS[2], ARGV[2])
redis.call("setex", KEYS[3], ARGV[4], ARGV[3])
return 1
`;

export type StreamIdempotencyLookup =
  | { status: 'found'; record: StreamIdempotencyRecord }
  | { status: 'not_found' }
  | { status: 'error' };

// `JSON.parse` returns `any` — a syntactically valid but structurally wrong
// value (`null`, `{}`, an outcome missing `messageId`, ...) would otherwise
// sail through an `as StreamIdempotencyRecord` cast unchecked, then either
// throw deep inside `resolveIdempotentSend`/the route on the first field
// access, or — worse, no throw at all — silently read as "no outcome yet"
// and let a corrupted record be treated as a fresh, resumable one. Runtime
// validation here is what makes `status: 'error'` in `StreamIdempotencyLookup`
// below an honest guarantee rather than "no *parse* error, but who knows."
const streamIdempotencyOutcomeSchema = z.object({
  kind: z.enum(['complete', 'fallback']),
  messageId: z.string(),
  content: z.string(),
  metadata: z.unknown(),
});

const streamIdempotencyRecordSchema = z.object({
  chatId: z.string(),
  userMessageId: z.string(),
  truncated: z.boolean(),
  removedCount: z.number(),
  outcome: streamIdempotencyOutcomeSchema.optional(),
});

export type StreamIdempotencyOutcome = z.infer<
  typeof streamIdempotencyOutcomeSchema
>;

export type StreamIdempotencyRecord = z.infer<
  typeof streamIdempotencyRecordSchema
>;

export interface StreamIdempotencyLock {
  token: string;
}

function streamIdempotencyKey(userId: string, idempotencyKey: string): string {
  return `${STREAM_IDEMPOTENCY_PREFIX}${userId}:${idempotencyKey}`;
}

function streamIdempotencyLockKey(
  userId: string,
  idempotencyKey: string,
): string {
  return `${STREAM_IDEMPOTENCY_LOCK_PREFIX}${userId}:${idempotencyKey}`;
}

/**
 * `'error'` is a distinct outcome from `'not_found'` — a Redis blip or a
 * corrupted value must never be treated as "no record exists", since a
 * caller that can't tell the two apart may go on to acquire the lock and
 * proceed with a fresh send while a real (merely unreadable-right-now)
 * record already exists, duplicating the user message once the write
 * overwrites it.
 */
export async function getStreamIdempotencyRecord(
  userId: string,
  idempotencyKey: string,
): Promise<StreamIdempotencyLookup> {
  const redis = getRedisClient();

  let raw: string | null;
  try {
    raw = await redis.get(streamIdempotencyKey(userId, idempotencyKey));
  } catch (error) {
    logError('Failed to read stream idempotency record', error, { userId });
    return { status: 'error' };
  }

  if (!raw) {
    return { status: 'not_found' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    logError('Failed to parse stream idempotency record', error, { userId });
    return { status: 'error' };
  }

  const validated = streamIdempotencyRecordSchema.safeParse(parsed);
  if (!validated.success) {
    logError('Stream idempotency record failed shape validation', validated.error, {
      userId,
    });
    return { status: 'error' };
  }

  return { status: 'found', record: validated.data };
}

/**
 * Persist a message and its idempotency-record transition as a single
 * atomic, *fenced* Redis write. Used for both phase transitions this module
 * defines: user message + progress record, and assistant message + outcome
 * record.
 *
 * Fenced on `token`: the write only lands if `token` still matches the
 * lock's current value at the moment the script runs, checked and written
 * in one atomic Lua script. This is not redundant with holding the lock at
 * call time — lease renewal can lag (a slow provider, a missed tick), so by
 * the time this call actually reaches Redis the lock may have expired and
 * been re-acquired by a different request. Without the fence, both the
 * stale holder and the new one could each successfully persist, landing
 * two assistant messages and two outcome writes for the same logical send.
 *
 * Returns `false` on failure — whether an infra error or the fence
 * rejecting the write because the token no longer owns the lock. Every
 * call site must check this rather than assume success, since proceeding
 * to emit `message_created` or call the LLM as though an unpersisted write
 * succeeded would defeat the guarantee this function exists to provide.
 */
export async function persistMessageWithIdempotencyRecord(
  chatId: string,
  message: MessageModel,
  userId: string,
  idempotencyKey: string,
  record: StreamIdempotencyRecord,
  lockToken: string,
): Promise<boolean> {
  const redis = getRedisClient();

  try {
    const result = await redis.eval(
      FENCED_PERSIST_SCRIPT,
      3,
      streamIdempotencyLockKey(userId, idempotencyKey),
      chatMessagesKey(chatId),
      streamIdempotencyKey(userId, idempotencyKey),
      lockToken,
      JSON.stringify(message),
      JSON.stringify(record),
      STREAM_IDEMPOTENCY_TTL_SECONDS,
    );

    if (result !== 1) {
      logWarn('Fenced message + idempotency-record write rejected', {
        chatId,
        userId,
        messageId: message.id,
      });
      return false;
    }

    // Best-effort freshness touch, deliberately outside the fenced write:
    // losing "last updated" on a crash is a sorting nicety, not the
    // correctness property this function exists to guarantee.
    await updateChat(chatId, { updatedAt: new Date() });

    return true;
  } catch (error) {
    logError(
      'Failed to atomically persist message with idempotency record',
      error,
      { chatId, userId, messageId: message.id },
    );
    return false;
  }
}

/**
 * Atomically claim the processing lock for this idempotency key with a
 * unique owner token, in a single `SET key token NX EX ttl` round trip.
 * Fails closed: if lock state can't be determined, returns `null` rather
 * than risking two requests both believing they own it.
 */
export async function acquireStreamIdempotencyLock(
  userId: string,
  idempotencyKey: string,
): Promise<StreamIdempotencyLock | null> {
  const redis = getRedisClient();
  const lockKey = streamIdempotencyLockKey(userId, idempotencyKey);
  const token = crypto.randomUUID();

  try {
    const result = await redis.set(
      lockKey,
      token,
      'EX',
      STREAM_IDEMPOTENCY_LOCK_TTL_SECONDS,
      'NX',
    );
    return result === 'OK' ? { token } : null;
  } catch (error) {
    logError('Failed to acquire stream idempotency lock', error, { userId });
    return null;
  }
}

/**
 * Extend the lock's lease, but only while `token` still matches the current
 * holder. Called periodically while a long LLM stream is in progress so an
 * active request's lock survives past its initial TTL; returns `false` if
 * the lock was lost (expired and re-acquired by someone else) in the
 * meantime, so the caller can stop treating itself as the owner.
 */
export async function renewStreamIdempotencyLock(
  userId: string,
  idempotencyKey: string,
  token: string,
): Promise<boolean> {
  const redis = getRedisClient();
  const lockKey = streamIdempotencyLockKey(userId, idempotencyKey);

  try {
    const result = await redis.eval(
      RENEW_LOCK_SCRIPT,
      1,
      lockKey,
      token,
      STREAM_IDEMPOTENCY_LOCK_TTL_SECONDS,
    );
    return result === 1;
  } catch (error) {
    logError('Failed to renew stream idempotency lock', error, { userId });
    return false;
  }
}

/**
 * Release the lock, but only if `token` still matches the current holder —
 * a plain DEL would delete whoever holds it *now*, which after this token's
 * lease has expired and been re-acquired by a different request is no
 * longer us.
 */
export async function releaseStreamIdempotencyLock(
  userId: string,
  idempotencyKey: string,
  token: string,
): Promise<void> {
  const redis = getRedisClient();
  const lockKey = streamIdempotencyLockKey(userId, idempotencyKey);

  try {
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token);
  } catch (error) {
    logError('Failed to release stream idempotency lock', error, { userId });
  }
}

/**
 * Update message status
 */
export async function updateMessageStatus(
  chatId: string,
  messageId: string,
  status: MessageModel['status']
): Promise<boolean> {
  const redis = getRedisClient();

  try {
    const messages = await redis.lrange(chatMessagesKey(chatId), 0, -1);

    for (let i = 0; i < messages.length; i++) {
      const message = JSON.parse(messages[i]);
      if (message.id === messageId) {
        message.status = status;
        message.updatedAt = new Date();
        await redis.lset(chatMessagesKey(chatId), i, JSON.stringify(message));
        return true;
      }
    }

    return false;
  } catch (error) {
    logError('Failed to update message status', error, { chatId, messageId });
    return false;
  }
}
