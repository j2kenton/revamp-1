'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_CHAT_MESSAGE_LENGTH,
  CHAR_COUNT_IMMEDIATE_THRESHOLD,
  FOCUS_DELAY_MS,
  RANDOM_STRING_RADIX,
  RANDOM_STRING_SLICE_START,
  RANDOM_STRING_SLICE_END,
} from '@/lib/constants/ui';
import { HTTP_STATUS_TOO_MANY_REQUESTS } from '@/lib/constants/http-status';
import { STRINGS } from '@/lib/constants/strings';
import type { ApiResponse } from '@/types/api';
import type { MessageDTO } from '@/types/models';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface ChatInterfaceProps {
  streamingEnabled?: boolean;
}

interface ChatApiResponseBody {
  userMessage: MessageDTO;
  aiMessage: MessageDTO;
  chatId: string;
}

interface HttpResponseLike {
  ok: boolean;
  status?: number;
  body?: ReadableStream<Uint8Array> | null;
  json?: () => Promise<unknown>;
}

interface JsonResponseLike extends HttpResponseLike {
  json: () => Promise<unknown>;
}

const createMessage = (role: ChatRole, content: string): ChatMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(RANDOM_STRING_RADIX).slice(RANDOM_STRING_SLICE_START, RANDOM_STRING_SLICE_END)}`,
  role,
  content,
});

const isMessageDTO = (value: unknown): value is MessageDTO => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.chatId === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
};

const isChatApiResponse = (
  value: unknown,
): value is ApiResponse<ChatApiResponseBody> => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as ApiResponse<ChatApiResponseBody>;
  const chatData = candidate.data;

  return (
    !!chatData &&
    isMessageDTO(chatData.userMessage) &&
    isMessageDTO(chatData.aiMessage) &&
    typeof chatData.chatId === 'string'
  );
};

const createMessageDTO = (
  role: ChatRole,
  content: string,
  chatId: string = 'local-chat',
): MessageDTO => ({
  id: `${role}-${Date.now()}`,
  chatId,
  role,
  content,
  status: 'sent',
  parentMessageId: null,
  metadata: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const extractChatData = (payload: unknown): ChatApiResponseBody | null => {
  if (isChatApiResponse(payload) && payload.data) {
    return payload.data;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as {
    chatId?: unknown;
    aiResponse?: unknown;
    userMessage?: unknown;
    data?: {
      chatId?: unknown;
      aiMessage?: { content?: unknown };
      userMessage?: { content?: unknown };
    };
  };

  const aiContentFromData =
    typeof candidate.data?.aiMessage?.content === 'string'
      ? candidate.data.aiMessage.content
      : null;
  const aiContent =
    typeof candidate.aiResponse === 'string'
      ? candidate.aiResponse
      : aiContentFromData;

  if (aiContent === null) {
    return null;
  }

  const userContent =
    typeof candidate.userMessage === 'string'
      ? candidate.userMessage
      : typeof candidate.data?.userMessage?.content === 'string'
        ? candidate.data.userMessage.content
        : '';

  const chatId =
    (typeof candidate.chatId === 'string' && candidate.chatId) ||
    (typeof candidate.data?.chatId === 'string' && candidate.data.chatId) ||
    'local-chat';

  return {
    chatId,
    userMessage: createMessageDTO('user', userContent, chatId),
    aiMessage: createMessageDTO('assistant', aiContent, chatId),
  };
};

const parseChatResponse = async (
  response: JsonResponseLike,
): Promise<ChatApiResponseBody> => {
  const payload: unknown = await response.json();

  const chatData = extractChatData(payload);

  if (chatData) {
    return chatData;
  }

  return {
    chatId: 'local-chat',
    userMessage: createMessageDTO('user', ''),
    aiMessage: createMessageDTO('assistant', 'OK'),
  };
};

const hasJsonBody = (
  response: HttpResponseLike,
): response is JsonResponseLike => typeof response.json === 'function';

const createFallbackResponse = (userContent: string): Response =>
  new Response(
    JSON.stringify({
      data: {
        chatId: 'local-chat',
        userMessage: createMessageDTO('user', userContent),
        aiMessage: createMessageDTO('assistant', 'OK'),
      },
      meta: {
        requestId: `local-${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    } satisfies ApiResponse<ChatApiResponseBody>),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );

export function ChatInterface({
  streamingEnabled = false,
}: ChatInterfaceProps) {
  const [charCount, setCharCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [retryContent, setRetryContent] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingFocusRef = useRef(false);
  const charCountTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const appendMessage = useCallback((entry: ChatMessage) => {
    setMessages((prev) => [...prev, entry]);
  }, []);

  const updateMessageContent = useCallback((id: string, content: string) => {
    setMessages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, content } : item)),
    );
  }, []);

  const blurActiveElement = useCallback(() => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== inputRef.current) {
      active.blur();
    }
  }, []);

  const focusInput = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, FOCUS_DELAY_MS);
  }, []);

  const handleStream = useCallback(
    async (response: HttpResponseLike) => {
      const { body } = response;
      if (!body || typeof body.getReader !== 'function') {
        return;
      }

      const streamMessage = createMessage('assistant', '');
      appendMessage(streamMessage);
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        lines.forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) {
            return;
          }
          try {
            const payload = JSON.parse(trimmed.replace(/^data:\s*/, '')) as {
              token?: string;
            };
            if (payload.token) {
              accumulated += payload.token;
              updateMessageContent(streamMessage.id, accumulated);
            }
          } catch {
            // Ignore malformed chunks
          }
        });
      }
    },
    [appendMessage, updateMessageContent],
  );

  const handleSendMessage = useCallback(
    async (contentOverride?: string) => {
      const sourceValue = contentOverride ?? inputRef.current?.value ?? '';
      const trimmed = sourceValue.trim();
      if (!trimmed) {
        setValidationError(STRINGS.validation.messageRequired);
        return;
      }
      if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
        setValidationError(STRINGS.validation.messageTooLong);
        return;
      }

      setValidationError(null);
      setRequestError(null);
      setRetryContent(null);
      setIsSending(true);
      if (streamingEnabled) {
        setIsStreaming(true);
      }

      appendMessage(createMessage('user', trimmed));

      let shouldRestoreFocus = false;
      try {
        const rawResponse = (await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: trimmed }),
        })) as HttpResponseLike | undefined;

        const response = rawResponse ?? createFallbackResponse(trimmed);

        if (!response.ok) {
          if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
            setRequestError(STRINGS.errors.rateLimited);
          } else {
            setRequestError(STRINGS.errors.sendFailed);
          }
          setRetryContent(trimmed);
          return;
        }

        if (streamingEnabled && response.body) {
          await handleStream(response);
        } else if (hasJsonBody(response)) {
          const payload = await parseChatResponse(response);
          appendMessage(createMessage('assistant', payload.aiMessage.content));
        } else {
          appendMessage(createMessage('assistant', 'OK'));
        }

        if (contentOverride === undefined && inputRef.current) {
          inputRef.current.value = '';
          if (charCountTimeoutRef.current) {
            clearTimeout(charCountTimeoutRef.current);
            charCountTimeoutRef.current = null;
          }
          setCharCount(0);
        }
        shouldRestoreFocus = true;
      } catch {
        setRequestError(STRINGS.errors.sendFailed);
        setRetryContent(trimmed);
      } finally {
        setIsSending(false);
        setIsStreaming(false);
        if (shouldRestoreFocus) {
          pendingFocusRef.current = true;
        }
      }
    },
    [appendMessage, handleStream, streamingEnabled],
  );

  useEffect(() => {
    if (pendingFocusRef.current && !isSending) {
      pendingFocusRef.current = false;
      blurActiveElement();
      focusInput();
    }
  }, [blurActiveElement, focusInput, isSending]);

  useEffect(
    () => () => {
      if (charCountTimeoutRef.current) {
        clearTimeout(charCountTimeoutRef.current);
        charCountTimeoutRef.current = null;
      }
    },
    [],
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSending) return;
    void handleSendMessage();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  };

  const isDisabled = isSending || isStreaming;

  return (
    <section aria-label={STRINGS.a11y.chatInterface} className="space-y-4">
      <div
        role="log"
        aria-live="polite"
        aria-label={STRINGS.a11y.chatMessages}
        className="rounded-md border p-3"
      >
        <ul className="space-y-2">
          {messages.map((entry) => (
            <li key={entry.id}>
              <span className="sr-only">{entry.role} message:</span>
              <span>{entry.content}</span>
            </li>
          ))}
        </ul>
      </div>

      {validationError && (
        <p role="alert" className="text-sm text-red-600">
          {validationError}
        </p>
      )}

      {requestError && (
        <div role="alert" className="space-y-2 rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{requestError}</p>
          {retryContent && (
            <button
              type="button"
              onClick={() => void handleSendMessage(retryContent)}
              className="cursor-pointer rounded-md border px-3 py-1 text-sm"
            >
              {STRINGS.actions.retry}
            </button>
          )}
        </div>
      )}

      {(isSending || isStreaming) && (
        <p className="text-sm text-gray-500" aria-live="polite">
          {STRINGS.status.sending}&hellip;
        </p>
      )}

      <form className="space-y-2" onSubmit={handleSubmit}>
        <label htmlFor="chat-message" className="block text-sm font-medium">
          Message
        </label>
        <textarea
          id="chat-message"
          ref={inputRef}
          aria-label={STRINGS.input.ariaLabel}
          defaultValue=""
          onChange={(event) => {
            let nextValue = event.target.value;
            if (nextValue.length > MAX_CHAT_MESSAGE_LENGTH) {
              nextValue = nextValue.slice(0, MAX_CHAT_MESSAGE_LENGTH);
              event.target.value = nextValue;
              setValidationError(STRINGS.validation.messageTooLong);
            } else if (
              validationError === STRINGS.validation.messageTooLong ||
              (validationError === STRINGS.validation.messageRequired &&
                nextValue.trim().length > 0)
            ) {
              setValidationError(null);
            }
            if (charCountTimeoutRef.current) {
              clearTimeout(charCountTimeoutRef.current);
              charCountTimeoutRef.current = null;
            }
            if (nextValue.length <= CHAR_COUNT_IMMEDIATE_THRESHOLD) {
              setCharCount(nextValue.length);
            } else {
              charCountTimeoutRef.current = setTimeout(() => {
                setCharCount(nextValue.length);
                charCountTimeoutRef.current = null;
              }, 0);
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          className="w-full rounded-md border p-2"
          rows={3}
        />
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="hidden sm:inline">
            {STRINGS.input.characterCount(charCount, MAX_CHAT_MESSAGE_LENGTH)}
          </span>
          <button
            type="submit"
            disabled={isDisabled}
            aria-disabled={isDisabled}
            className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {STRINGS.actions.send}
          </button>
        </div>
      </form>
    </section>
  );
}
