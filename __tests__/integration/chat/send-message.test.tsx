import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ChatInput } from '@/app/chat/components/ChatInput';

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  status: 'sending' | 'sent' | 'failed';
}

const originalFetch = global.fetch;
const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

const buildResponse = (payload: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

beforeAll(() => {
  global.fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockReset();
});

afterAll(() => {
  global.fetch = originalFetch;
});

function TestChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSendMessage = async (content: string) => {
    const optimisticId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, content, role: 'user', status: 'sending' },
    ]);
    setIsStreaming(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optimisticId
            ? { ...msg, id: data.data.userMessage.id, status: 'sent' }
            : msg,
        ),
      );

      setMessages((prev) => [
        ...prev,
        {
          id: data.data.aiMessage.id,
          content: data.data.aiMessage.content,
          role: 'assistant',
          status: 'sent',
        },
      ]);
    } catch (err) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optimisticId ? { ...msg, status: 'failed' } : msg,
        ),
      );
      setError(err as Error);
    } finally {
      setIsStreaming(false);
    }
  };

  const retryMessage = (message: ChatMessage) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== message.id));
    void handleSendMessage(message.content);
  };

  return (
    <div>
      <div role="log" aria-live="polite">
        <ul>
          {messages.map((message) => (
            <li key={message.id}>
              <span>{message.content}</span>
              <span data-testid={`${message.id}-status`}>{message.status}</span>
              {message.status === 'failed' && (
                <button onClick={() => retryMessage(message)}>Retry</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <ChatInput
        onSendMessage={handleSendMessage}
        isStreaming={isStreaming}
        error={error}
        rateLimitSeconds={null}
      />
    </div>
  );
}

describe('ChatInput integration', () => {
  const renderChat = () => render(<TestChat />);

  it('shows optimistic message then AI response', async () => {
    fetchMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return buildResponse({
        data: {
          userMessage: {
            id: 'user-1',
            content: 'Hello AI',
            role: 'user',
            status: 'sent',
            createdAt: new Date().toISOString(),
          },
          aiMessage: {
            id: 'ai-1',
            content: 'AI response',
            role: 'assistant',
            status: 'sent',
            createdAt: new Date().toISOString(),
          },
        },
      });
    });

    const user = userEvent.setup();
    renderChat();

    const input = screen.getByRole('textbox', { name: /message input/i });
    await user.type(input, 'Hello AI');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.getByText('Hello AI')).toBeInTheDocument();
    expect(screen.getByTestId(/temp-/)).toHaveTextContent('sending');

    await waitFor(() => {
      expect(screen.getByText('AI response')).toBeInTheDocument();
    });
  });

  it('handles server errors gracefully', async () => {
    fetchMock.mockResolvedValue(
      buildResponse(
        { error: { code: 'LLM_ERROR', message: 'Service unavailable' } },
        { status: 500 },
      ),
    );

    const user = userEvent.setup();
    renderChat();

    const input = screen.getByRole('textbox', { name: /message input/i });
    await user.type(input, 'Hello AI');
    await user.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('prevents duplicate sends while streaming', async () => {
    const requestSpy = jest.fn();
    fetchMock.mockImplementation(async () => {
      requestSpy();
      await new Promise((resolve) => setTimeout(resolve, 100));
      return buildResponse({
        data: {
          userMessage: {
            id: 'user-one',
            content: 'Hello',
            role: 'user',
            status: 'sent',
            createdAt: new Date().toISOString(),
          },
          aiMessage: {
            id: 'ai-one',
            content: 'OK',
            role: 'assistant',
            status: 'sent',
            createdAt: new Date().toISOString(),
          },
        },
      });
    });

    const user = userEvent.setup();
    renderChat();

    const input = screen.getByRole('textbox', { name: /message input/i });
    await user.type(input, 'Hello');

    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);
    await user.click(sendButton);
    await user.click(sendButton);

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText('OK')).toBeInTheDocument();
    });
  });
});
