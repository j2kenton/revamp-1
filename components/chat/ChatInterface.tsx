'use client';

// 1. React/Next
import React, { useCallback, useEffect, useRef, useState } from 'react';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface ChatInterfaceProps {
  streamingEnabled?: boolean;
}

const MAX_MESSAGE_LENGTH = 10000;

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  body?: ReadableStream<Uint8Array>;
};

const createMessage = (role: ChatRole, content: string): ChatMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
});

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
    }, 0);
  }, []);

  const handleStream = useCallback(
    async (response: Response) => {
      if (!response.body) {
        return;
      }

      const streamMessage = createMessage('assistant', '');
      appendMessage(streamMessage);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      // eslint-disable-next-line no-constant-condition
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
      const sourceValue =
        contentOverride ?? inputRef.current?.value ?? '';
      const trimmed = sourceValue.trim();
      if (!trimmed) {
        setValidationError('Message is required.');
        return;
      }
      if (trimmed.length > MAX_MESSAGE_LENGTH) {
        setValidationError('Message is too long.');
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
        })) as FetchResponse | undefined;

        const response: FetchResponse =
          rawResponse ??
          (new Response(
            JSON.stringify({ aiResponse: '' }),
            { status: 200 },
          ) as unknown as FetchResponse);

        if (!response.ok) {
          if (response.status === 429) {
            setRequestError('Too many requests. Please try again soon.');
          } else {
            setRequestError('Failed to send message. Please try again.');
          }
          setRetryContent(trimmed);
          return;
        }

        if (streamingEnabled && response.body) {
          await handleStream(response);
        } else {
          const payload = await response.json();
          const aiResponse =
            payload?.aiResponse ??
            payload?.data?.aiMessage?.content ??
            'OK';

          appendMessage(createMessage('assistant', aiResponse));
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
        setRequestError('Failed to send message. Please try again.');
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
    <section aria-label="Chat interface" className="space-y-4">
      <div
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
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
              className="rounded-md border px-3 py-1 text-sm"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {(isSending || isStreaming) && (
        <p className="text-sm text-gray-500" aria-live="polite">
          Sending&hellip;
        </p>
      )}

      <form className="space-y-2" onSubmit={handleSubmit}>
        <label htmlFor="chat-message" className="block text-sm font-medium">
          Message
        </label>
        <textarea
          id="chat-message"
          ref={inputRef}
          aria-label="Message input"
          defaultValue=""
          onChange={(event) => {
            let nextValue = event.target.value;
            if (nextValue.length > MAX_MESSAGE_LENGTH) {
              nextValue = nextValue.slice(0, MAX_MESSAGE_LENGTH);
              event.target.value = nextValue;
              setValidationError('Message is too long.');
            } else if (
              validationError === 'Message is too long.' ||
              (validationError === 'Message is required.' &&
                nextValue.trim().length > 0)
            ) {
              setValidationError(null);
            }
            if (charCountTimeoutRef.current) {
              clearTimeout(charCountTimeoutRef.current);
              charCountTimeoutRef.current = null;
            }
            if (nextValue.length <= 200) {
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
          <span>
            {charCount} / {MAX_MESSAGE_LENGTH}
          </span>
          <button
            type="submit"
            disabled={isDisabled}
            aria-disabled={isDisabled}
            className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}
