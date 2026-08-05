/**
 * useStreamingResponse Hook
 * Hook for streaming AI responses using Server-Sent Events (SSE)
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/useAuth';
import { deriveCsrfToken } from '@/lib/auth/csrf';
import { chatHistoryQueryKey } from '@/app/chat/utils/chatQueryKey';
import { parseSseEvents } from '@/lib/sse/parseSseEvents';
import { withJitter } from '@/lib/utils/backoff';
import type { MessageDTO } from '@/types/models';
import {
  BYPASS_ACCESS_TOKEN,
  BYPASS_CSRF_TOKEN,
  isBypassAuthEnabled,
} from '@/lib/auth/bypass';
import { STRINGS } from '@/lib/constants/strings';
import { ONE_SECOND_IN_MS, PARSE_INT_RADIX } from '@/lib/constants/common';

const MAX_RECONNECT_ATTEMPTS = 3;
const TEST_STREAM_CHUNK_DELAY_MS = 15;
const STATUS_TOO_MANY_REQUESTS = 429;
const RETRY_AFTER_FALLBACK = '0';
const MIN_RETRY_AFTER_SECONDS = 1;
const DEFAULT_RETRY_AFTER_SECONDS = 30;
const RECONNECT_BACKOFF_MULTIPLIER = 2;
const RECONNECT_BACKOFF_BASE_MS = ONE_SECOND_IN_MS;
// Jittered so that many clients dropped by the same server blip don't all
// reconnect on the same tick.
const calculateReconnectDelay = (attempt: number) =>
  withJitter(
    Math.pow(RECONNECT_BACKOFF_MULTIPLIER, attempt) * RECONNECT_BACKOFF_BASE_MS,
  );

interface MessageCacheUpdate
  extends Partial<Omit<MessageDTO, 'id' | 'chatId'>> {
  id: string;
  chatId: string;
}

interface StreamingMessage {
  id: string;
  content: string;
  isComplete: boolean;
  contextTruncated?: boolean;
  messagesRemoved?: number;
}

interface UseStreamingResponseOptions {
  chatId?: string;
  onMessageCreated?: (
    messageId: string,
    chatId: string,
    truncated?: boolean,
    removedCount?: number,
  ) => void;
  onComplete?: (message: MessageDTO) => void;
  onError?: (error: Error) => void;
  onFallback?: (message: string) => void;
}

export function useStreamingResponse(options: UseStreamingResponseOptions) {
  const { chatId, onMessageCreated, onComplete, onError, onFallback } = options;
  const { accessToken, authIdentityKey } = useAuth();
  const bypassAuth = isBypassAuthEnabled();
  const queryClient = useQueryClient();
  const isAutomatedTestMode = process.env.NEXT_PUBLIC_TEST_AUTH_MODE === 'true';

  const [streamingMessage, setStreamingMessage] =
    useState<StreamingMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const [contextTruncated, setContextTruncated] = useState(false);
  const [messagesRemoved, setMessagesRemoved] = useState(0);
  const contextTruncatedRef = useRef(false);
  const messagesRemovedRef = useRef(0);
  const activeChatIdRef = useRef<string | null>(chatId ?? null);
  const [liveMessages, setLiveMessages] = useState<MessageDTO[]>([]);
  const previousChatIdRef = useRef<string | null>(chatId ?? null);
  const lastUserMessageRef = useRef<{
    content: string;
    parentMessageId: string | null;
    messageId: string | null;
    /** Client-minted ID of the optimistic echo, until the server's real ID replaces it. */
    tempId: string | null;
    /**
     * The idempotency key sent to the server for this logical send. Looks
     * redundant with `tempId` — both start as the same freshly-minted value
     * — but the two must be cleared on different schedules. `tempId` is
     * cleared by `handleMessageCreated` the moment the echo is reconciled
     * (its job is done: the real message has replaced it in the UI). This
     * key stays alive until a true terminal event (`handleMessageComplete`/
     * `handleFallback`), specifically so it survives past `message_created`.
     * If it didn't, a connection that dies after the server persisted the
     * user message but before it stored an outcome would have no key left
     * to resend with — a later resend would mint a fresh one, the server
     * would see no record for it, and process it as brand new: a duplicate
     * user turn, even though the original is sitting in Redis half-done and
     * the server's resume path exists specifically to pick it back up.
     */
    idempotencyKey: string | null;
  }>({
    content: '',
    parentMessageId: null,
    messageId: null,
    tempId: null,
    idempotencyKey: null,
  });
  /**
   * Identity of the assistant message currently mid-stream — written by
   * `handleContentDelta` at `status: 'sending'`, cleared by whichever
   * terminal handler (`handleMessageComplete`/`handleFallback`/
   * `handleStreamError`) reconciles it. If a failure reaches the catch block
   * while this is still set, the partial reply was left unreconciled and
   * must be marked `failed` rather than left showing a permanent spinner.
   */
  const pendingAssistantMessageRef = useRef<{
    id: string;
    chatId: string;
  } | null>(null);

  useEffect(() => {
    activeChatIdRef.current = chatId ?? null;
  }, [chatId]);

  useEffect(() => {
    const prevChatId = previousChatIdRef.current;
    if (!chatId) {
      setLiveMessages([]);
      previousChatIdRef.current = null;
      return;
    }

    if (prevChatId && chatId && prevChatId !== chatId) {
      setLiveMessages([]);
    }
    previousChatIdRef.current = chatId;
  }, [chatId]);

  /**
   * Insert-or-update a message in `liveMessages` — the in-memory list for the
   * stream currently in flight, cleared whenever `chatId` changes.
   *
   * Kept alongside the TanStack Query cache rather than replacing it. The two
   * differ in lifetime AND in trust level. `liveMessages` is the copy that
   * works before a `chatId` exists — on a new chat the history query is
   * disabled, so this is the only thing rendering the first exchange — and it
   * is the only store that ever holds the *optimistic echo*: the user's
   * message rendered under a client-minted `temp_` ID before the server
   * confirms it. The cache is written exclusively from SSE handlers (i.e.
   * server-sent data) and survives unmount.
   *
   * Redis stays the source of truth: `message_created` swaps the echo for the
   * server's confirmed copy, and `invalidateQueries` on completion lets
   * refetched server state overwrite everything. See ADR-004.
   */
  const upsertLiveMessage = (message: MessageDTO) => {
    setLiveMessages((prev) => {
      const index = prev.findIndex((entry) => entry.id === message.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = message;
        return next;
      }
      return [...prev, message];
    });
  };

  const removeLiveMessage = (messageId: string) => {
    setLiveMessages((prev) => prev.filter((entry) => entry.id !== messageId));
  };

  /**
   * The send failed before the server confirmed persistence — flip the
   * optimistic echo to `failed` so the user sees exactly which message
   * didn't make it, in place, rather than a detached error banner alone.
   * No-op once `message_created` has reconciled the echo away.
   */
  const markOptimisticMessageFailed = () => {
    const { tempId } = lastUserMessageRef.current;
    if (!tempId) {
      return;
    }
    setLiveMessages((prev) =>
      prev.map((entry) =>
        entry.id === tempId
          ? { ...entry, status: 'failed', updatedAt: new Date().toISOString() }
          : entry,
      ),
    );
  };

  /**
   * The assistant's reply was interrupted after at least one `content_delta`
   * arrived but before any terminal event reconciled it — flip that partial
   * reply to `failed` in both stores instead of leaving it at `sending`
   * forever (which otherwise renders as a permanent loading spinner next to
   * the error banner). No-op once a terminal handler already cleared it.
   */
  const markAssistantMessageFailed = () => {
    const pending = pendingAssistantMessageRef.current;
    if (!pending) {
      return;
    }
    const timestamp = new Date().toISOString();
    upsertMessageInCache({
      id: pending.id,
      chatId: pending.chatId,
      status: 'failed',
      updatedAt: timestamp,
    });
    setLiveMessages((prev) =>
      prev.map((entry) =>
        entry.id === pending.id
          ? { ...entry, status: 'failed', updatedAt: timestamp }
          : entry,
      ),
    );
    pendingAssistantMessageRef.current = null;
  };

  const shouldTrackLiveMessage = (messageChatId: string) => {
    const activeChatId = activeChatIdRef.current || chatId;
    return Boolean(
      messageChatId && activeChatId && messageChatId === activeChatId,
    );
  };

  const upsertMessageInCache = (update: MessageCacheUpdate) => {
    const targetChatId = update.chatId;
    if (!targetChatId) {
      return;
    }

    queryClient.setQueryData(
      chatHistoryQueryKey(authIdentityKey, targetChatId),
      (old: { messages?: MessageDTO[] } | undefined) => {
        const existingMessages = old?.messages ?? [];
        const targetIndex = existingMessages.findIndex(
          (entry) => entry.id === update.id,
        );
        const baseline: MessageDTO =
          targetIndex >= 0
            ? existingMessages[targetIndex]
            : {
                id: update.id,
                chatId: targetChatId,
                role: 'assistant',
                content: '',
                status: 'sending',
                parentMessageId: null,
                metadata: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

        const nextMessage: MessageDTO = {
          ...baseline,
          ...update,
          metadata:
            update.metadata === undefined ? baseline.metadata : update.metadata,
          parentMessageId:
            update.parentMessageId === undefined
              ? baseline.parentMessageId
              : update.parentMessageId,
        };

        const nextMessages =
          targetIndex >= 0
            ? [
                ...existingMessages.slice(0, targetIndex),
                nextMessage,
                ...existingMessages.slice(targetIndex + 1),
              ]
            : [...existingMessages, nextMessage];

        return {
          ...old,
          messages: nextMessages,
        };
      },
    );
  };

  const resetTruncationState = () => {
    setContextTruncated(false);
    setMessagesRemoved(0);
    contextTruncatedRef.current = false;
    messagesRemovedRef.current = 0;
  };

  const clearLastUserMessage = () => {
    lastUserMessageRef.current = {
      content: '',
      parentMessageId: null,
      messageId: null,
      tempId: null,
      idempotencyKey: null,
    };
  };

  /** Clear per-send state and mark the stream as active. */
  const resetStateForNewStream = () => {
    setError(null);
    setIsStreaming(true);
    setStreamingMessage(null);
    setRateLimitSeconds(null);
    resetTruncationState();
    // Defensive, not load-bearing: the catch block's retry path already
    // reconciles a pending partial reply (`markAssistantMessageFailed`,
    // which itself nulls this ref) before ever scheduling a retry, so this
    // should already be null by the time a retry gets here. Reset anyway
    // so a genuinely new send never inherits stale tracking from an
    // unrelated prior stream.
    pendingAssistantMessageRef.current = null;
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  /**
   * Abort the in-flight streaming fetch and abandon everything that
   * belonged to it. Also cancels any pending reconnect-with-backoff timer —
   * without this, a scheduled reconnect could still fire after
   * unmount/an account switch and start a new request using the prior
   * account's captured token and chat ID.
   *
   * Also clears `liveMessages`/`streamingMessage`/the optimistic-echo ref —
   * not just the network connection. This matters for "New Chat" clicked
   * while the very first send is still pending: `chatId` is `undefined`
   * both before and after, so `setChatId(undefined)` in the caller is a
   * no-op that never changes the `chatId` prop, and the effect that would
   * otherwise clear `liveMessages` on a `chatId` change never reruns.
   * Without this, the abandoned optimistic echo (or a partial assistant
   * reply) would stay visible indefinitely.
   *
   * Also resets `reconnectAttempts`: abandoning a send mid-retry-sequence
   * must not leave the counter elevated for whatever the caller sends next
   * — otherwise an unrelated future message silently gets fewer retries,
   * or none at all if the abandoned sequence had already reached the cap.
   */
  // Kept as a manual useCallback (unlike the other functions in this hook):
  // its identity is a dependency of the unmount-cleanup effect below, so
  // instability here isn't just a wasted render — it would abort the live
  // SSE connection on every re-render during an active stream, not just on
  // unmount. Jest runs via ts-jest, which never applies the React Compiler
  // (only the real Next.js/Turbopack build does), so this correctness
  // guarantee can't be verified by our test suite the way the compiler's
  // other memoization can — leaving it manual here is the safe choice
  // regardless of what the compiler does in production.
  const closeConnection = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsStreaming(false);
    setStreamingMessage(null);
    setLiveMessages([]);
    activeChatIdRef.current = null;
    clearLastUserMessage();
    pendingAssistantMessageRef.current = null;
    reconnectAttempts.current = 0;
  }, []);

  /**
   * The server has persisted the user's message and assigned it an ID. Adopt
   * the server's chat ID (first message of a new chat) and swap the optimistic
   * echo for the server's confirmed copy under its real ID. From this point
   * the user's message on screen is known-persisted. See ADR-004.
   */
  const handleMessageCreated = (data: Record<string, unknown>) => {
    const isTruncated = Boolean(data.truncated);
    const removedCount =
      isTruncated && typeof data.removedCount === 'number'
        ? data.removedCount
        : 0;
    const resolvedChatId: string =
      (typeof data.chatId === 'string' && data.chatId) ||
      activeChatIdRef.current ||
      '';
    const messageId =
      typeof data.messageId === 'string' ? data.messageId : '';

    if (resolvedChatId) {
      activeChatIdRef.current = resolvedChatId;
    }

    setContextTruncated(isTruncated);
    setMessagesRemoved(removedCount);
    contextTruncatedRef.current = isTruncated;
    messagesRemovedRef.current = removedCount;

    if (resolvedChatId && messageId) {
      lastUserMessageRef.current.messageId = messageId;
      const timestamp = new Date().toISOString();

      // Reconcile the optimistic echo: the server's copy (real ID, confirmed
      // persisted) replaces the client-minted one. Deliberately clears only
      // `tempId`, not `idempotencyKey` — the echo's job is done, but the
      // send isn't over until a terminal event; see the field's doc comment.
      const { tempId } = lastUserMessageRef.current;
      if (tempId) {
        removeLiveMessage(tempId);
        lastUserMessageRef.current.tempId = null;
      }

      upsertMessageInCache({
        id: messageId,
        chatId: resolvedChatId,
        role: 'user',
        content: lastUserMessageRef.current.content,
        status: 'sent',
        parentMessageId: lastUserMessageRef.current.parentMessageId,
        metadata: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      if (shouldTrackLiveMessage(resolvedChatId)) {
        upsertLiveMessage({
          id: messageId,
          chatId: resolvedChatId,
          role: 'user',
          content: lastUserMessageRef.current.content,
          status: 'sent',
          parentMessageId: lastUserMessageRef.current.parentMessageId,
          metadata: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }

    onMessageCreated?.(
      messageId,
      resolvedChatId,
      Boolean(data.truncated),
      typeof data.removedCount === 'number' ? data.removedCount : undefined,
    );
  };

  /**
   * A chunk of the assistant's reply arrived. Returns the new accumulated
   * content so the caller can carry it to the next delta.
   */
  const handleContentDelta = (
    data: Record<string, unknown>,
    accumulatedContent: string,
  ): string => {
    const nextAccumulatedContent =
      typeof data.accumulatedContent === 'string'
        ? data.accumulatedContent
        : accumulatedContent;
    const messageId =
      typeof data.messageId === 'string' ? data.messageId : '';
    const isContextTruncated = contextTruncatedRef.current;
    const removedMessagesCount = isContextTruncated
      ? messagesRemovedRef.current
      : undefined;
    const resolvedChatId = activeChatIdRef.current || chatId || '';

    if (messageId && resolvedChatId) {
      // Tracks this reply as "in flight, unreconciled" until a terminal
      // handler clears it — see `markAssistantMessageFailed`.
      pendingAssistantMessageRef.current = {
        id: messageId,
        chatId: resolvedChatId,
      };
      upsertMessageInCache({
        id: messageId,
        chatId: resolvedChatId,
        role: 'assistant',
        content: nextAccumulatedContent,
        status: 'sending',
        parentMessageId: lastUserMessageRef.current.messageId ?? null,
        metadata: isContextTruncated
          ? {
              contextTruncated: true,
              messagesRemoved: removedMessagesCount,
            }
          : undefined,
        updatedAt: new Date().toISOString(),
      });
      if (shouldTrackLiveMessage(resolvedChatId)) {
        upsertLiveMessage({
          id: messageId,
          chatId: resolvedChatId,
          role: 'assistant',
          content: nextAccumulatedContent,
          status: 'sending',
          parentMessageId: lastUserMessageRef.current.messageId ?? null,
          metadata: isContextTruncated
            ? {
                contextTruncated: true,
                messagesRemoved: removedMessagesCount,
              }
            : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    setStreamingMessage({
      id: messageId,
      content: nextAccumulatedContent,
      isComplete: false,
      contextTruncated: isContextTruncated,
      messagesRemoved: removedMessagesCount,
    });

    return nextAccumulatedContent;
  };

  /** The assistant's reply finished normally — persist the final message. */
  const handleMessageComplete = (data: Record<string, unknown>) => {
    const resolvedChatId = activeChatIdRef.current || chatId || '';
    const messageId =
      typeof data.messageId === 'string' ? data.messageId : '';
    const content = typeof data.content === 'string' ? data.content : '';
    const metadata = (data.metadata as MessageDTO['metadata']) || null;
    const parentForAssistant = lastUserMessageRef.current.messageId;
    setStreamingMessage(null);

    const completeMessage: MessageDTO = {
      id: messageId,
      chatId: resolvedChatId,
      role: 'assistant',
      content,
      status: 'sent',
      parentMessageId: parentForAssistant,
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onComplete?.(completeMessage);
    if (resolvedChatId) {
      upsertMessageInCache({
        ...completeMessage,
      });
      if (shouldTrackLiveMessage(resolvedChatId)) {
        upsertLiveMessage(completeMessage);
      }

      queryClient.invalidateQueries({
        queryKey: chatHistoryQueryKey(authIdentityKey, resolvedChatId),
      });
    }

    resetTruncationState();
    clearLastUserMessage();
    // The reply reached a terminal status ('sent') above — no longer
    // unreconciled, so a later failure on this connection must not touch it.
    pendingAssistantMessageRef.current = null;
  };

  /**
   * The LLM circuit breaker is open — the server sent a canned reply instead
   * of a model response. Treated as a completed message, flagged in metadata.
   */
  const handleFallback = (data: Record<string, unknown>) => {
    const resolvedChatId =
      (typeof data.chatId === 'string' && data.chatId) ||
      activeChatIdRef.current ||
      chatId ||
      '';
    const fallbackMetadata = {
      ...(data.metadata as MessageDTO['metadata'] | null),
      circuitBreakerOpen: true,
    };
    const fallbackMessage: MessageDTO = {
      id: typeof data.messageId === 'string' ? data.messageId : '',
      chatId: resolvedChatId,
      role: 'assistant',
      content: typeof data.message === 'string' ? data.message : '',
      status: 'sent',
      parentMessageId: lastUserMessageRef.current.messageId,
      metadata: fallbackMetadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setStreamingMessage(null);
    resetTruncationState();
    onComplete?.(fallbackMessage);

    if (resolvedChatId) {
      upsertMessageInCache({
        ...fallbackMessage,
      });
      queryClient.invalidateQueries({
        queryKey: chatHistoryQueryKey(authIdentityKey, resolvedChatId),
      });
      if (shouldTrackLiveMessage(resolvedChatId)) {
        upsertLiveMessage(fallbackMessage);
      }
    }

    onFallback?.(fallbackMessage.content);
    clearLastUserMessage();
    // Reached a terminal status ('sent', flagged circuitBreakerOpen) above.
    pendingAssistantMessageRef.current = null;
  };

  /** The server reported an error mid-stream. */
  const handleStreamError = (data: Record<string, unknown>) => {
    const streamError = new Error(
      typeof data.message === 'string'
        ? data.message
        : STRINGS.errors.streamingGeneric,
    );
    setStreamingMessage(null);
    // An explicit error event can itself arrive after content_delta already
    // wrote a partial reply — reconcile it the same way an interrupted
    // connection does, rather than leaving it stuck at 'sending'.
    markAssistantMessageFailed();
    // If the error arrived before `message_created`, the user's message was
    // never persisted — surface that on the echo. No-op after reconciliation.
    markOptimisticMessageFailed();
    setError(streamError);
    onError?.(streamError);
  };

  /**
   * Send message and start streaming response
   */
  const simulateTestStream = async (
    content: string,
    parentMessageId?: string,
  ) => {
    resetStateForNewStream();

    const resolvedChatId =
      activeChatIdRef.current || chatId || `test-chat-${Date.now()}`;
    activeChatIdRef.current = resolvedChatId;

    const userMessageId = `test-user-${Date.now()}`;
    const assistantMessageId = `test-assistant-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const userMessage: MessageDTO = {
      id: userMessageId,
      chatId: resolvedChatId,
      role: 'user',
      content,
      status: 'sent',
      parentMessageId: parentMessageId ?? null,
      metadata: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    onMessageCreated?.(userMessageId, resolvedChatId, false, 0);
    upsertMessageInCache(userMessage);
    upsertLiveMessage(userMessage);

    const simulatedChunks = [
      STRINGS.streaming.testIntro(content),
      STRINGS.streaming.testChunk,
    ];

    let accumulated = '';
    for (const chunk of simulatedChunks) {
      accumulated = accumulated ? `${accumulated} ${chunk}` : chunk;
      const partialMessage: MessageDTO = {
        id: assistantMessageId,
        chatId: resolvedChatId,
        role: 'assistant',
        content: accumulated,
        status: 'sending',
        parentMessageId: userMessageId,
        metadata: null,
        createdAt: nowIso,
        updatedAt: new Date().toISOString(),
      };
      setStreamingMessage({
        id: assistantMessageId,
        content: accumulated,
        isComplete: false,
      });
      upsertLiveMessage(partialMessage);
      // Small delay to mimic streaming without slowing tests noticeably
      await new Promise((resolve) =>
        setTimeout(resolve, TEST_STREAM_CHUNK_DELAY_MS),
      );
    }

    const assistantMessage: MessageDTO = {
      id: assistantMessageId,
      chatId: resolvedChatId,
      role: 'assistant',
      content: accumulated,
      status: 'sent',
      parentMessageId: userMessageId,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    upsertMessageInCache(assistantMessage);
    upsertLiveMessage(assistantMessage);

    // Mark as complete and keep state for UI/tests
    setStreamingMessage({
      id: assistantMessageId,
      content: accumulated,
      isComplete: true,
    });

    onComplete?.(assistantMessage);
    setIsStreaming(false);
  };

  const sendStreamingMessage = async (
    content: string,
    parentMessageId?: string,
  ) => {
    if (isAutomatedTestMode) {
      await simulateTestStream(content, parentMessageId);
      return;
    }

    const token = accessToken ?? (bypassAuth ? BYPASS_ACCESS_TOKEN : null);
    if (!token) {
      const authError = new Error(STRINGS.errors.notAuthenticated);
      setError(authError);
      onError?.(authError);
      return;
    }

    // Set true only when the catch block schedules a backoff retry, so
    // `finally` below can tell "this send is genuinely done" apart from
    // "this send is paused mid-backoff." Without this, `isStreaming` (which
    // gates the input) goes false the instant a retry is scheduled, letting
    // the user submit a second message while the first is still pending —
    // the two sends then share `lastUserMessageRef`/`abortControllerRef`,
    // and whichever finishes second corrupts the other's echo/tempId.
    let retryScheduled = false;

    try {
      resetStateForNewStream();

      // Optimistic echo: render the user's message immediately under a
      // client-minted ID, before the server has seen it. `message_created`
      // reconciles it away in favour of the server's copy; failure paths
      // flip it to `failed` instead. A reconnect retry of the same content
      // reuses the existing echo rather than minting a duplicate.
      //
      // The idempotency key is reused independently of the echo's tempId —
      // by the time a *resend* of the same content happens, `tempId` may
      // already be null (message_created reconciled it on an earlier
      // attempt within this same logical send), but the key must still
      // carry forward so the server recognizes this as the same send. See
      // the field's doc comment for why the two can't share one lifecycle.
      const previous = lastUserMessageRef.current;
      const sameLogicalSend = previous.content === content;
      // A retry of a send that already reached `message_created` has a
      // real, persisted message under `previous.messageId` — the UI
      // already shows it (reconciled away from any optimistic echo when
      // that event first fired). Resuming reuses that identity directly
      // rather than minting a fresh tempId and briefly rendering a second,
      // duplicate "sending" bubble beside it until this retry's own
      // message_created (necessarily reporting that same ID) reconciles
      // it away again.
      const resumingPersistedMessageId =
        sameLogicalSend && previous.messageId ? previous.messageId : null;
      const tempId = resumingPersistedMessageId
        ? null
        : sameLogicalSend && previous.tempId
          ? previous.tempId
          : `temp_${crypto.randomUUID()}`;
      const idempotencyKey =
        sameLogicalSend && previous.idempotencyKey
          ? previous.idempotencyKey
          : `temp_${crypto.randomUUID()}`;
      lastUserMessageRef.current = {
        content,
        parentMessageId: parentMessageId ?? null,
        messageId: resumingPersistedMessageId,
        tempId,
        idempotencyKey,
      };
      const optimisticTimestamp = new Date().toISOString();
      if (tempId) {
        upsertLiveMessage({
          id: tempId,
          chatId: activeChatIdRef.current || chatId || '',
          role: 'user',
          content,
          status: 'sending',
          parentMessageId: parentMessageId ?? null,
          metadata: null,
          createdAt: optimisticTimestamp,
          updatedAt: optimisticTimestamp,
        });
      }

      // Stable across retries *and* later resends of this same logical send
      // (reused above, independent of the echo's tempId) — the server uses
      // it to recognize a retried/resent POST as the same send rather than
      // a new one. See StreamIdempotencyRecord.
      const payload = {
        content,
        chatId: chatId || undefined,
        parentMessageId,
        idempotencyKey,
      };

      const csrfToken = bypassAuth
        ? BYPASS_CSRF_TOKEN
        : await deriveCsrfToken(token);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Initiate streaming request
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (response.status === STATUS_TOO_MANY_REQUESTS) {
        let errorMessage: string = STRINGS.errors.rateLimited;
        let retryAfter = parseInt(
          response.headers.get('Retry-After') ?? RETRY_AFTER_FALLBACK,
          PARSE_INT_RADIX,
        );

        try {
          const errorBody = await response.json();
          errorMessage = errorBody.error?.message || errorMessage;
          const detailRetry = errorBody.error?.details?.retryAfter;
          if (typeof detailRetry === 'number') {
            retryAfter = detailRetry;
          }
        } catch {
          // Ignore parsing failures
        }

        const normalizedRetry = Number.isFinite(retryAfter)
          ? Math.max(retryAfter, MIN_RETRY_AFTER_SECONDS)
          : DEFAULT_RETRY_AFTER_SECONDS;

        setRateLimitSeconds(normalizedRetry);

        // The server rejected the send outright — the message was never
        // persisted, so the echo must not keep claiming "sending".
        markOptimisticMessageFailed();

        const rateLimitError = new Error(errorMessage);
        rateLimitError.name = 'RateLimitError';
        setError(rateLimitError);
        onError?.(rateLimitError);
        setIsStreaming(false);
        // This is a second, separate terminal exit for the logical send
        // (an automatic retry can itself land here, not just the first
        // attempt) — must not skip the same reset the other terminal exit
        // point applies, or the next unrelated message inherits a
        // partially-spent retry budget.
        reconnectAttempts.current = 0;
        return;
      }

      if (!response.ok) {
        let errorMessage: string = STRINGS.errors.streamingStartFailed;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody.error?.message || errorMessage;
        } catch {
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch {
            // ignore parse failure
          }
        }
        throw new Error(errorMessage);
      }

      // Get the readable stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error(STRINGS.errors.emptyResponse);
      }

      // Process SSE stream
      let buffer = '';
      let accumulatedContent = '';
      // `message_created` only confirms the user's message was saved — the
      // turn itself isn't done until one of these three fires. A clean EOF
      // (`done: true`) without any of them means the connection dropped
      // mid-turn (proxy/server closed early), not that the turn finished; it
      // must not be treated as success.
      let receivedTerminalEvent = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (!receivedTerminalEvent) {
            throw new Error(STRINGS.errors.streamInterrupted);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSseEvents(buffer);
        buffer = remainder;

        for (const { type, data } of events) {
          switch (type) {
            case 'message_created':
              handleMessageCreated(data);
              break;

            case 'content_delta':
              accumulatedContent = handleContentDelta(
                data,
                accumulatedContent,
              );
              break;

            case 'message_complete':
              handleMessageComplete(data);
              receivedTerminalEvent = true;
              break;

            case 'fallback':
              handleFallback(data);
              receivedTerminalEvent = true;
              break;

            case 'error':
              if (data.error === 'lock_lost') {
                // Retryable, unlike other `error` events: the server lost
                // the idempotency lock it needed to safely finish this
                // reply (see route.ts), but the user's message is still
                // persisted and safely resumable under its idempotencyKey
                // — resolveIdempotentSend exists specifically to pick this
                // back up. Throwing routes it through the same catch-block
                // retry path as a transport failure, rather than the
                // terminal handling every other `error` event gets below.
                throw new Error(
                  typeof data.message === 'string'
                    ? data.message
                    : STRINGS.errors.streamingGeneric,
                );
              }
              handleStreamError(data);
              receivedTerminalEvent = true;
              break;

            default:
              break;
          }
        }

        if (receivedTerminalEvent) {
          // The turn is done — stop reading. `handleMessageComplete` and
          // `handleFallback` both clear `lastUserMessageRef`, which is the
          // catch block's only signal that the message was already
          // persisted. Continuing to read (and letting a later read()
          // reject) would fall into the catch block with that signal gone,
          // making a completed send look retryable and resending it.
          // Stopping here removes that failure mode entirely rather than
          // relying on ref state to detect it after the fact.
          try {
            void reader.cancel?.()?.catch?.(() => {});
          } catch {
            // Best-effort release; the connection is already done with.
          }
          break;
        }
      }

      reconnectAttempts.current = 0;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Deliberately aborted (e.g. unmount/account switch) — not a
        // stream failure, so no error state and no reconnect attempt.
        return;
      }

      setStreamingMessage(null);
      const streamError =
        err instanceof Error ? err : new Error(STRINGS.errors.streamingGeneric);
      setError(streamError);
      onError?.(streamError);

      // Once `message_created` has fired, the server already persisted this
      // content — `messageId` is set. Resending used to be unsafe here: a
      // plain retry would POST the same content again with no way for the
      // server to recognize it as the same send, creating a duplicate
      // message (and, on a brand-new chat, a second chat) — so this used to
      // be treated as an interrupted *response*, never retried, leaving
      // recovery to the user manually resending identical content later.
      // That's no longer true: `idempotencyKey` now survives this failure
      // (see the field's doc comment), and the server's
      // `resolveIdempotentSend` safely replays a completed outcome, resumes
      // an abandoned in-progress attempt under the SAME persisted user
      // message, or bounded-waits and gives up — it never re-persists the
      // user message under a key that's already in use. A post-ack failure
      // is therefore just as safe to retry as a pre-ack one.
      const alreadyPersisted = Boolean(lastUserMessageRef.current.messageId);

      // A partial reply (content_delta already ran) must be reconciled
      // here, before any retry — not just on final give-up. A retry now
      // resumes the *user* message identity, but the *assistant* reply
      // always gets a brand-new ID each attempt (see route.ts), and
      // `resetStateForNewStream` unconditionally clears
      // `pendingAssistantMessageRef` for the next attempt. Skipping this
      // would silently orphan the superseded entry at `status: 'sending'`
      // forever — no terminal handler for its old ID will ever run again —
      // rendering as a permanent spinner beside whatever the retry produces
      // under its new ID. No-op if nothing was pending (the common case: no
      // delta ever arrived).
      markAssistantMessageFailed();

      // Attempt reconnection with exponential backoff
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        // Keep `lastUserMessageRef` (and its `tempId`) intact: the retry
        // resends the same content and must reuse the existing optimistic
        // echo, not mint a second one.
        const delay = calculateReconnectDelay(reconnectAttempts.current);
        reconnectAttempts.current++;
        retryScheduled = true;

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          void sendStreamingMessage(content, parentMessageId);
        }, delay);
      } else {
        if (!alreadyPersisted) {
          // Out of retries and the message never reached the server. The
          // echo flips to `failed` so the failure is visible on the message
          // itself.
          markOptimisticMessageFailed();
        }
        // Already-persisted case: the user's message is already the
        // server's confirmed copy (handleMessageCreated reconciled it) —
        // nothing to mark failed there, just let the error state surface
        // that the assistant's reply didn't finish (already reconciled
        // above, if a partial one was pending).
        // Deliberately NOT clearLastUserMessage() here: content,
        // parentMessageId, and — critically — idempotencyKey must survive
        // this give-up. Automatic retry has stopped, but the send isn't
        // truly over: the server may hold a persisted user message with no
        // outcome yet (a crash, or a still-running attempt whose ack we
        // never received). If the same content is ever resent — a future
        // manual retry, or simply the user sending it again — reusing this
        // key is what lets the server's resume path recognize it instead of
        // creating a second user message under a fresh one. Only a genuine
        // terminal event (handleMessageComplete/handleFallback) or an
        // explicit abandon (closeConnection) clears this ref; giving up on
        // automatic retry is not the same as the send being finished.
        // The next `sendStreamingMessage` call overwrites this ref
        // wholesale regardless of what's left here, so nothing leaks into
        // an unrelated future send.
        reconnectAttempts.current = 0;
      }
    } finally {
      abortControllerRef.current = null;
      // Keep the operation locked through backoff: if a retry was just
      // scheduled, this logical send isn't done yet, so `isStreaming` (which
      // gates the input, see the comment above `retryScheduled`) must stay
      // true until the retry itself settles.
      if (!retryScheduled) {
        setIsStreaming(false);
      }
    }
  };

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      closeConnection();
    };
  }, [closeConnection]);

  return {
    sendStreamingMessage,
    streamingMessage,
    isStreaming,
    error,
    closeConnection,
    contextTruncated,
    messagesRemoved,
    rateLimitSeconds,
    liveMessages,
  };
}
