import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { Provider } from 'react-redux';
import { legacy_createStore as createStore, combineReducers } from 'redux';
import { chatReducer } from '@/lib/redux/features/chat/reducer';

// Mock SWR
jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    data: [],
    error: null,
    isLoading: false,
    mutate: jest.fn(),
  })),
}));

const createMockStore = () =>
  createStore(
    combineReducers({
      chat: chatReducer,
    }),
  );

describe('ChatInterface', () => {
  let store: ReturnType<typeof createMockStore>;
  const user = userEvent.setup();

  beforeEach(() => {
    store = createMockStore();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Accessibility', () => {
    it('has accessible form elements', () => {
      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      expect(input).toHaveAttribute('aria-label');

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeInTheDocument();
    });

    it('announces new messages to screen readers', async () => {
      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const liveRegion = screen.getByRole('log', { name: /chat messages/i });
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    });

    it('manages focus correctly after sending message', async () => {
      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      const sendButton = screen.getByRole('button', { name: /send/i });

      await user.type(input, 'Test message');
      await user.click(sendButton);

      // Focus should return to input after sending
      await waitFor(() => {
        expect(input).toHaveFocus();
      });
    });

    it('supports keyboard navigation', async () => {
      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });

      await user.type(input, 'Test message');
      await user.keyboard('{Enter}');

      // Message should be sent with Enter key
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Input Validation', () => {
    it('prevents sending empty messages', async () => {
      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByText(/message is required/i)).toBeInTheDocument();
    });

    it('trims whitespace from messages', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ aiResponse: 'Response' }),
      });

      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      await user.type(input, '   Test message   ');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({ message: 'Test message' }),
          }),
        );
      });
    });

    it('shows error for messages exceeding character limit', async () => {
      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      const longMessage = 'a'.repeat(10001);

      fireEvent.change(input, { target: { value: longMessage } });

      expect(screen.getByText(/message is too long/i)).toBeInTheDocument();
    });
  });

  describe('Message Sending', () => {
    it('sends message and displays response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chatId: 'chat-123',
          userMessage: 'Hello',
          aiResponse: 'Hi there!',
        }),
      });

      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
        expect(screen.getByText('Hi there!')).toBeInTheDocument();
      });
    });

    it('disables input while sending', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      const sendButton = screen.getByRole('button', { name: /send/i });

      await user.type(input, 'Test');
      await user.click(sendButton);

      expect(input).toBeDisabled();
      expect(sendButton).toBeDisabled();
    });

    it('shows loading indicator during send', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      await user.type(input, 'Test');
      await user.keyboard('{Enter}');

      expect(screen.getByText(/sending/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows error message on network failure', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      await user.type(input, 'Test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText(/failed to send message/i)).toBeInTheDocument();
      });
    });

    it('provides retry option on failure', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ aiResponse: 'Success' }),
        });

      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      await user.type(input, 'Test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        const retryButton = screen.getByRole('button', { name: /retry/i });
        expect(retryButton).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /retry/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Success')).toBeInTheDocument();
      });
    });

    it('handles rate limit errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit exceeded' }),
      });

      render(
        <Provider store={store}>
          <ChatInterface />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      await user.type(input, 'Test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
      });
    });
  });

  describe('Streaming Support', () => {
    it('displays streaming responses progressively', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"token": "Hello"}\n\n'),
          );
          controller.enqueue(
            new TextEncoder().encode('data: {"token": " world"}\n\n'),
          );
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      render(
        <Provider store={store}>
          <ChatInterface streamingEnabled={true} />
        </Provider>,
      );

      const input = screen.getByRole('textbox', { name: /message/i });
      await user.type(input, 'Test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText(/Hello/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/Hello world/i)).toBeInTheDocument();
      });
    });
  });
});
