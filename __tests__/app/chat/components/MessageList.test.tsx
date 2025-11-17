import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageList } from '@/app/chat/components/MessageList';
import { Provider } from 'react-redux';
import { createStore, combineReducers } from 'redux';
import { chatReducer } from '@/lib/redux/features/chat/reducer';

const mockMessages = [
  {
    id: '1',
    role: 'user' as const,
    content: 'Hello',
    timestamp: new Date().toISOString(),
  },
  {
    id: '2',
    role: 'assistant' as const,
    content: 'Hi there! How can I help you today?',
    timestamp: new Date().toISOString(),
  },
];

const createMockStore = (chatState = {}) => {
  const rootReducer = combineReducers({
    chat: chatReducer,
  });

  const preloadedState = {
    chat: {
      messages: [],
      isLoading: false,
      error: null,
      isStreaming: false,
      streamingMessage: null,
      ...chatState,
    },
  };

  return createStore(rootReducer, preloadedState);
};

describe('MessageList', () => {
  it('renders messages correctly', () => {
    const store = createMockStore({ messages: mockMessages });

    render(
      <Provider store={store}>
        <MessageList />
      </Provider>,
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText(/Hi there/)).toBeInTheDocument();
  });

  it('shows empty state when no messages', () => {
    const store = createMockStore({ messages: [] });

    render(
      <Provider store={store}>
        <MessageList />
      </Provider>,
    );

    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    const store = createMockStore({ isLoading: true });

    render(
      <Provider store={store}>
        <MessageList />
      </Provider>,
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByLabelText(/loading messages/i)).toBeInTheDocument();
  });

  it('shows error state with retry button', () => {
    const store = createMockStore({ error: 'Failed to load messages' });

    render(
      <Provider store={store}>
        <MessageList />
      </Provider>,
    );

    expect(screen.getByText(/failed to load messages/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('auto-scrolls to bottom on new messages', () => {
    const scrollIntoViewMock = jest.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    const store = createMockStore({ messages: mockMessages });

    const { rerender } = render(
      <Provider store={store}>
        <MessageList />
      </Provider>,
    );

    const newMessages = [
      ...mockMessages,
      {
        id: '3',
        role: 'user' as const,
        content: 'New message',
        timestamp: new Date().toISOString(),
      },
    ];

    const newStore = createMockStore({ messages: newMessages });

    rerender(
      <Provider store={newStore}>
        <MessageList />
      </Provider>,
    );

    expect(scrollIntoViewMock).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    );
  });

  it('renders streaming message with typing indicator', () => {
    const store = createMockStore({
      messages: mockMessages,
      isStreaming: true,
      streamingMessage: {
        id: 'stream-1',
        content: 'Thinking...',
      },
    });

    render(
      <Provider store={store}>
        <MessageList />
      </Provider>,
    );

    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
  });

  it('handles message actions (copy, edit, delete)', () => {
    const store = createMockStore({ messages: mockMessages });

    render(
      <Provider store={store}>
        <MessageList />
      </Provider>,
    );

    // Find message actions
    const firstMessage = screen.getByText('Hello').closest('[role="article"]');
    const copyButton = within(firstMessage!).getByRole('button', {
      name: /copy/i,
    });

    fireEvent.click(copyButton);

    // Check if copy was triggered
    expect(screen.getByText(/copied/i)).toBeInTheDocument();
  });

  it('supports virtual scrolling for large lists', () => {
    const manyMessages = Array.from({ length: 100 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : ('assistant' as const),
      content: `Message ${i}`,
      timestamp: new Date().toISOString(),
    }));

    const store = createMockStore({ messages: manyMessages });

    render(
      <Provider store={store}>
        <MessageList />
      </Provider>,
    );

    // Only visible messages should be rendered (virtual scrolling)
    const renderedMessages = screen.getAllByRole('article');
    expect(renderedMessages.length).toBeLessThan(100);
  });
});
