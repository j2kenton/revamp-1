/**
 * useStreamingResponse Hook
 * Hook for streaming AI responses using Server-Sent Events (SSE)
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/useAuth';
import { deriveCsrfToken } from '@/lib/auth/csrf';
import type { MessageDTO } from '@/types/models';
import { BYPASS_ACCESS_TOKEN, BYPASS_CSRF_TOKEN, isBypassAuthEnabled } from '@/lib/auth/bypass';

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
  chatId: string | null;
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
  const { accessToken } = useAuth();
  const bypassAuth = isBypassAuthEnabled();
  const queryClient = useQueryClient();
  const isAutomatedTestMode = process.env.NEXT_PUBLIC_TEST_AUTH_MODE === 'true';

  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const [contextTruncated, setContextTruncated] = useState(false);
  const [messagesRemoved, setMessagesRemoved] = useState(0);
  const contextTruncatedRef = useRef(false);
  const messagesRemovedRef = useRef(0);
  const activeChatIdRef = useRef<string | null>(chatId);
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
    activeChatIdRef.current = chatId;
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

  const upsertLiveMessage = useCallback(
    (message: MessageDTO) => {
      setLiveMessages((prev) => {
        const index = prev.findIndex((entry) => entry.id === message.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = message;
          return next;
        }
        return [...prev, message];
      });
    },
    [],
  );

  const shouldTrackLiveMessage = useCallback(
    (messageChatId: string) => {
      const activeChatId = activeChatIdRef.current || chatId;
      return Boolean(messageChatId && activeChatId && messageChatId === activeChatId);
    },
    [chatId],
  );

  const upsertMessageInCache = useCallback(
    (update: MessageCacheUpdate) => {
      const targetChatId = update.chatId;
      if (!targetChatId) {
        return;
      }

      queryClient.setQueryData(
        ['chat', targetChatId],
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
    },
    [queryClient],
  );

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  /**
   * Close SSE connection
   */
  const closeConnection = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  /**
   * Send message and start streaming response
   */
  const simulateTestStream = useCallback(
    async (content: string, parentMessageId?: string) => {
      setError(null);
      setIsStreaming(true);
      setStreamingMessage(null);
      setRateLimitSeconds(null);
      setContextTruncated(false);
      setMessagesRemoved(0);
      contextTruncatedRef.current = false;
      messagesRemovedRef.current = 0;

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
        `Thanks for your message: "${content}".`,
        'This automated test response simulates streaming output.',
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
        await new Promise((resolve) => setTimeout(resolve, 15));
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
      setStreamingMessage(null);

      onComplete?.(assistantMessage);
      setIsStreaming(false);
    },
    [chatId, onComplete, onMessageCreated, upsertLiveMessage, upsertMessageInCache],
  );

  const sendStreamingMessage = useCallback(
    async (content: string, parentMessageId?: string) => {
      if (isAutomatedTestMode) {
        await simulateTestStream(content, parentMessageId);
        return;
      }

      const token = accessToken ?? (bypassAuth ? BYPASS_ACCESS_TOKEN : null);
      if (!token) {
        const authError = new Error('Not authenticated');
        setError(authError);
        onError?.(authError);
        return;
      }

      try {
        setError(null);
        setIsStreaming(true);
        setStreamingMessage(null);
        setRateLimitSeconds(null);
        setContextTruncated(false);
        setMessagesRemoved(0);
        contextTruncatedRef.current = false;
        messagesRemovedRef.current = 0;
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

        // Initiate streaming request
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 429) {
          let errorMessage = 'Too many requests';
          let retryAfter = parseInt(response.headers.get('Retry-After') ?? '0', 10);

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
            ? Math.max(retryAfter, 1)
            : 30;

          setRateLimitSeconds(normalizedRetry);

          const rateLimitError = new Error(errorMessage);
          rateLimitError.name = 'RateLimitError';
          setError(rateLimitError);
          onError?.(rateLimitError);
          setIsStreaming(false);
          return;
        }

        if (!response.ok) {
          let errorMessage = 'Failed to start streaming';
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
          throw new Error('No response body');
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
          const eventBlocks = buffer.split('\n\n');
          buffer = eventBlocks.pop() || '';

          for (const rawEvent of eventBlocks) {
            const trimmedEvent = rawEvent.trim();
            if (!trimmedEvent) {
              continue;
            }

            const lines = trimmedEvent.split('\n');
            let eventType = 'message';
            let dataPayload = '';

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line || line.startsWith(':')) {
                continue;
              }

              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                const valuePart = line.slice(5).trim();
                dataPayload = dataPayload ? `${dataPayload}\n${valuePart}` : valuePart;
              }
            }

            if (!dataPayload) {
              continue;
            }

            let parsedData: unknown;
            try {
              parsedData = JSON.parse(dataPayload);
            } catch (parseError) {
              console.error('Failed to parse streaming payload', parseError);
              continue;
            }

            if (typeof parsedData !== 'object' || parsedData === null) {
              continue;
            }

            const data = parsedData as Record<string, unknown>;

            switch (eventType) {
              case 'message_created': {
                const isTruncated = Boolean(data.truncated);
                const removedCount =
                  isTruncated && typeof data.removedCount === 'number' ? data.removedCount : 0;
                const resolvedChatId: string =
                  (typeof data.chatId === 'string' && data.chatId) ||
                  activeChatIdRef.current ||
                  '';
                const messageId = typeof data.messageId === 'string' ? data.messageId : '';

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
                break;
              }

              case 'content_delta': {
                accumulatedContent =
                  typeof data.accumulatedContent === 'string'
                    ? data.accumulatedContent
                    : accumulatedContent;
                const messageId = typeof data.messageId === 'string' ? data.messageId : '';
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
                    content: accumulatedContent,
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
                      content: accumulatedContent,
                      status: 'sending',
                      parentMessageId: lastUserMessageRef.current.messageId ?? null,
                      metadata: isContextTruncated
                        ? {
                            contextTruncated: true,
                            messagesRemoved: removedMessagesCount,
                          }
                        : undefined,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    });
                  }
                }
                setStreamingMessage({
                  id: messageId,
                  content: accumulatedContent,
                  isComplete: false,
                  contextTruncated: isContextTruncated,
                  messagesRemoved: removedMessagesCount,
                });
                break;
              }

              case 'message_complete': {
                const resolvedChatId = activeChatIdRef.current || chatId || '';
                const messageId = typeof data.messageId === 'string' ? data.messageId : '';
                const content = typeof data.content === 'string' ? data.content : '';
                const metadata = (data.metadata as MessageDTO['metadata']) || null;
                const parentForAssistant = lastUserMessageRef.current.messageId;
                setStreamingMessage(null);

                // Create complete message DTO
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
                }

                // Update cache
                if (resolvedChatId) {
                  queryClient.invalidateQueries({ queryKey: ['chat', resolvedChatId] });
                }

                // Reset truncation state
                setContextTruncated(false);
                setMessagesRemoved(0);
                contextTruncatedRef.current = false;
                messagesRemovedRef.current = 0;
                lastUserMessageRef.current = {
                  content: '',
                  parentMessageId: null,
                  messageId: null,
                };

                break;
              }

              case 'fallback': {
                const resolvedChatId =
                  (typeof data.chatId === 'string' && data.chatId) ||
                  activeChatIdRef.current ||
                  chatId ||
                  '';
                // Circuit breaker is open - received fallback message
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
                setContextTruncated(false);
                setMessagesRemoved(0);
                contextTruncatedRef.current = false;
                messagesRemovedRef.current = 0;
                onComplete?.(fallbackMessage);
                if (resolvedChatId) {
                  upsertMessageInCache({
                    ...fallbackMessage,
                  });
                  queryClient.invalidateQueries({ queryKey: ['chat', resolvedChatId] });
                  if (shouldTrackLiveMessage(resolvedChatId)) {
                    upsertLiveMessage(fallbackMessage);
                  }
                }
                onFallback?.(fallbackMessage.content);
                lastUserMessageRef.current = {
                  content: '',
                  parentMessageId: null,
                  messageId: null,
                };
                break;
              }

              case 'error': {
                const streamError = new Error(
                  typeof data.message === 'string' ? data.message : 'Streaming error'
                );
                setStreamingMessage(null);
                setError(streamError);
                onError?.(streamError);
                break;
              }

              default:
                break;
            }
          }
        }

        reconnectAttempts.current = 0;
      } catch (err) {
        lastUserMessageRef.current = {
          content: '',
          parentMessageId: null,
          messageId: null,
        };
        setStreamingMessage(null);
        const streamError = err instanceof Error ? err : new Error('Unknown streaming error');
        setError(streamError);
        onError?.(streamError);

        // Attempt reconnection with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.pow(2, reconnectAttempts.current) * 1000;
          reconnectAttempts.current++;

          setTimeout(() => {
            void sendStreamingMessage(content, parentMessageId);
          }, delay);
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [
      accessToken,
      upsertMessageInCache,
      bypassAuth,
      chatId,
      isAutomatedTestMode,
      onMessageCreated,
      onComplete,
      onError,
      onFallback,
      queryClient,
      simulateTestStream,
    ]
  );

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
