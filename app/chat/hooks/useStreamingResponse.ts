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
  }>({
    content: '',
    parentMessageId: null,
    messageId: null,
  });

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
   * Insert-or-update a message in `liveMessages` — the in-memory list of
   * messages for the stream currently in flight. This is deliberately
   * separate from the TanStack Query cache (the persisted source of truth):
   * live messages render immediately as tokens arrive, then `MessageList`
   * merges them over the persisted history by ID.
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
    };
  };

  /** Clear per-send state and mark the stream as active. */
  const resetStateForNewStream = () => {
    setError(null);
    setIsStreaming(true);
    setStreamingMessage(null);
    setRateLimitSeconds(null);
    resetTruncationState();
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  /**
   * Abort the in-flight streaming fetch. Also cancels any pending
   * reconnect-with-backoff timer — without this, a scheduled reconnect could
   * still fire after unmount/an account switch and start a new request using
   * the prior account's captured token and chat ID.
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
  }, []);

  /**
   * The server has persisted the user's message and assigned it an ID. Adopt
   * the server's chat ID (first message of a new chat) and reconcile the
   * optimistic user message with its real ID.
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
  };

  /** The server reported an error mid-stream. */
  const handleStreamError = (data: Record<string, unknown>) => {
    const streamError = new Error(
      typeof data.message === 'string'
        ? data.message
        : STRINGS.errors.streamingGeneric,
    );
    setStreamingMessage(null);
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

    try {
      resetStateForNewStream();
      lastUserMessageRef.current = {
        content,
        parentMessageId: parentMessageId ?? null,
        messageId: null,
      };

      // Create FormData or JSON payload
      const payload = {
        content,
        chatId: chatId || undefined,
        parentMessageId,
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

        const rateLimitError = new Error(errorMessage);
        rateLimitError.name = 'RateLimitError';
        setError(rateLimitError);
        onError?.(rateLimitError);
        setIsStreaming(false);
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

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
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
              break;

            case 'fallback':
              handleFallback(data);
              break;

            case 'error':
              handleStreamError(data);
              break;

            default:
              break;
          }
        }
      }

      reconnectAttempts.current = 0;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Deliberately aborted (e.g. unmount/account switch) — not a
        // stream failure, so no error state and no reconnect attempt.
        return;
      }

      clearLastUserMessage();
      setStreamingMessage(null);
      const streamError =
        err instanceof Error ? err : new Error(STRINGS.errors.streamingGeneric);
      setError(streamError);
      onError?.(streamError);

      // Attempt reconnection with exponential backoff
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = calculateReconnectDelay(reconnectAttempts.current);
        reconnectAttempts.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          void sendStreamingMessage(content, parentMessageId);
        }, delay);
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
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
