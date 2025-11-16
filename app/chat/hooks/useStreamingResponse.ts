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
}

interface UseStreamingResponseOptions {
  chatId: string | null;
  onMessageCreated?: (messageId: string) => void;
  onComplete?: (message: MessageDTO) => void;
  onError?: (error: Error) => void;
}

export function useStreamingResponse(options: UseStreamingResponseOptions) {
  const { chatId, onMessageCreated, onComplete, onError } = options;
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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
                  case 'message_created':
                    onMessageCreated?.(data.messageId);
                    break;

                  case 'content_delta':
                    accumulatedContent = data.accumulatedContent;
                    setStreamingMessage({
                      id: data.messageId,
                      content: accumulatedContent,
                      isComplete: false,
                    });
                    break;

                  case 'message_complete':
                    setStreamingMessage({
                      id: data.messageId,
                      content: data.content,
                      isComplete: true,
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

                    break;

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
    [accessToken, chatId, onMessageCreated, onComplete, onError, queryClient]
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
  };
}
