import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer from '@/lib/redux/features/chat/reducer';
import { ChatInterface } from '@/components/chat/ChatInterface';
import '@testing-library/jest-dom';

// Mock API responses
const mockFetch = jest.fn();
global.fetch = mockFetch;

const createTestStore = () => {
  return configureStore({
    reducer: {
      chat: chatReducer,
    },
  });
};

describe('Chat Flow Integration', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chatId: 'test-chat',
        userMessage: 'Hello',
        aiResponse: 'Hi there!',
      }),
    });
  });

  it('completes full conversation flow', async () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <ChatInterface />
      </Provider>,
    );

    // Check initial state
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();

    // Type and send message
    const input = screen.getByRole('textbox', { name: /message/i });
    await user.type(input, 'Hello AI');
    await user.keyboard('{Enter}');

    // Verify message sent
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message: 'Hello AI' }),
        }),
      );
    });

    // Verify UI updates
    await waitFor(() => {
      expect(screen.getByText('Hello AI')).toBeInTheDocument();
      expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });

    // Input should be cleared and focused
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('handles multiple messages in sequence', async () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <ChatInterface />
      </Provider>,
    );

    const input = screen.getByRole('textbox', { name: /message/i });

    // Send first message
    await user.type(input, 'First message');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('First message')).toBeInTheDocument();
    });

    // Send second message
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        chatId: 'test-chat',
        userMessage: 'Second message',
        aiResponse: 'Second response',
      }),
    });

    await user.type(input, 'Second message');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Second message')).toBeInTheDocument();
      expect(screen.getByText('Second response')).toBeInTheDocument();
    });

    // Verify message order
    const messages = screen.getAllByRole('article');
    expect(messages).toHaveLength(4); // 2 user + 2 assistant
  });

  it('recovers from temporary errors', async () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <ChatInterface />
      </Provider>,
    );

    // First attempt fails
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const input = screen.getByRole('textbox', { name: /message/i });
    await user.type(input, 'Test message');
    await user.keyboard('{Enter}');

    // Error should be shown
    await waitFor(() => {
      expect(screen.getByText(/failed to send/i)).toBeInTheDocument();
    });

    // Retry succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        chatId: 'test-chat',
        userMessage: 'Test message',
        aiResponse: 'Success!',
      }),
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('Success!')).toBeInTheDocument();
    });
  });

  it('maintains conversation context', async () => {
    const store = createTestStore();

    // Mock chat history endpoint
    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/chat/test-chat')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [
              { id: '1', role: 'user', content: 'Previous message' },
              { id: '2', role: 'assistant', content: 'Previous response' },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ aiResponse: 'New response' }),
      });
    });

    render(
      <Provider store={store}>
        <ChatInterface chatId="test-chat" />
      </Provider>,
    );

    // History should load
    await waitFor(() => {
      expect(screen.getByText('Previous message')).toBeInTheDocument();
      expect(screen.getByText('Previous response')).toBeInTheDocument();
    });

    // New message maintains context
    const input = screen.getByRole('textbox', { name: /message/i });
    await user.type(input, 'Continue conversation');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Continue conversation')).toBeInTheDocument();
    });

    // All messages should be present
    expect(screen.getByText('Previous message')).toBeInTheDocument();
    expect(screen.getByText('Previous response')).toBeInTheDocument();
    expect(screen.getByText('Continue conversation')).toBeInTheDocument();
  });
});
