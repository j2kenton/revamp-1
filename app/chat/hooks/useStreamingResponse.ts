/**
 * useStreamingResponse Hook
 * Hook for streaming AI responses using Server-Sent Events (SSE)
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import type { MessageDTO } from '@/types/models';

interface StreamingMessage {
  id: string;
  content: string;
  isComplete: boolean;
  contextTruncated?: boolean;
  messagesRemoved?: number;
}

interface UseStreamingResponseOptions {
  chatId: string | null;
  onMessageCreated?: (messageId: string, truncated?: boolean, removedCount?: number) => void;
  onComplete?: (message: MessageDTO) => void;
  onError?: (error: Error) => void;
  onFallback?: (message: string) => void;
}

export function useStreamingResponse(options: UseStreamingResponseOptions) {
  const { chatId, onMessageCreated, onComplete, onError, onFallback } = options;
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [contextTruncated, setContextTruncated] = useState(false);
  const [messagesRemoved, setMessagesRemoved] = useState(0);
  const contextTruncatedRef = useRef(false);
  const messagesRemovedRef = useRef(0);

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
  const sendStreamingMessage = useCallback(
    async (content: string, parentMessageId?: string) => {
      if (!accessToken) {
        const authError = new Error('Not authenticated');
        setError(authError);
        onError?.(authError);
        return;
      }

      try {
        setError(null);
        setIsStreaming(true);
        setStreamingMessage(null);
        setContextTruncated(false);
        setMessagesRemoved(0);
        contextTruncatedRef.current = false;
        messagesRemovedRef.current = 0;

        // Create FormData or JSON payload
        const payload = {
          content,
          chatId: chatId || undefined,
          parentMessageId,
        };

        // Initiate streaming request
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error('Failed to start streaming');
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
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              const eventMatch = line.match(/event: (.+)/);
              const dataMatch = lines[lines.indexOf(line) + 1]?.match(/data: (.+)/);

              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1];
                const data = JSON.parse(dataMatch[1]);

                switch (eventType) {
                  case 'message_created': {
                    const isTruncated = Boolean(data.truncated);
                    const removedCount = isTruncated ? data.removedCount || 0 : 0;

                    setContextTruncated(isTruncated);
                    setMessagesRemoved(removedCount);
                    contextTruncatedRef.current = isTruncated;
                    messagesRemovedRef.current = removedCount;

                    onMessageCreated?.(data.messageId, data.truncated, data.removedCount);
                    break;
                  }

                  case 'content_delta': {
                    accumulatedContent = data.accumulatedContent;
                    const isContextTruncated = contextTruncatedRef.current;
                    const removedMessagesCount = isContextTruncated
                      ? messagesRemovedRef.current
                      : undefined;
                    setStreamingMessage({
                      id: data.messageId,
                      content: accumulatedContent,
                      isComplete: false,
                      contextTruncated: isContextTruncated,
                      messagesRemoved: removedMessagesCount,
                    });
                    break;
                  }

                  case 'message_complete':
                    setStreamingMessage({
                      id: data.messageId,
                      content: data.content,
                      isComplete: true,
                      contextTruncated: data.metadata?.contextTruncated,
                      messagesRemoved: data.metadata?.messagesRemoved,
                    });

                    // Create complete message DTO
                    const completeMessage: MessageDTO = {
                      id: data.messageId,
                      chatId: chatId || '',
                      role: 'assistant',
                      content: data.content,
                      status: 'sent',
                      parentMessageId: null,
                      metadata: data.metadata,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };

                    onComplete?.(completeMessage);

                    // Update cache
                    if (chatId) {
                      queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
                    }

                    // Reset truncation state
                    setContextTruncated(false);
                    setMessagesRemoved(0);
                    contextTruncatedRef.current = false;
                    messagesRemovedRef.current = 0;

                    break;

                  case 'fallback': {
                    // Circuit breaker is open - received fallback message
                    const fallbackMetadata = {
                      ...data.metadata,
                      circuitBreakerOpen: true,
                    };
                    const fallbackMessage: MessageDTO = {
                      id: data.messageId,
                      chatId: chatId || '',
                      role: 'assistant',
                      content: data.message,
                      status: 'sent',
                      parentMessageId: null,
                      metadata: fallbackMetadata,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    setStreamingMessage({
                      id: data.messageId,
                      content: data.message,
                      isComplete: true,
                    });
                    setContextTruncated(false);
                    setMessagesRemoved(0);
                    contextTruncatedRef.current = false;
                    messagesRemovedRef.current = 0;
                    onComplete?.(fallbackMessage);
                    if (chatId) {
                      queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
                    }
                    onFallback?.(data.message);
                    break;
                  }

                  case 'error':
                    const streamError = new Error(data.message || 'Streaming error');
                    setError(streamError);
                    onError?.(streamError);
                    break;
                }
              }
            }
          }
        }

        reconnectAttempts.current = 0;
      } catch (err) {
        const streamError = err instanceof Error ? err : new Error('Unknown streaming error');
        setError(streamError);
        onError?.(streamError);

        // Attempt reconnection with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.pow(2, reconnectAttempts.current) * 1000;
          reconnectAttempts.current++;

          setTimeout(() => {
            sendStreamingMessage(content, parentMessageId);
          }, delay);
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [accessToken, chatId, onMessageCreated, onComplete, onError, onFallback, queryClient]
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
  };
}
