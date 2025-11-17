import { renderHook, act, waitFor } from '@testing-library/react';
import { useSendMessage } from '@/app/chat/hooks/useSendMessage';
import { Provider } from 'react-redux';
import { createStore, combineReducers } from 'redux';
import chatReducer from '@/lib/redux/reducers/chat';
import React from 'react';

// Mock fetch globally
global.fetch = jest.fn();

const createMockStore = (initialState = {}) => {
  const rootReducer = combineReducers({
    chat: chatReducer,
  });
  
  return createStore(
    rootReducer,
    {
      chat: {
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        streamingMessage: null,
        ...initialState,
      },
    }
  );
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={createMockStore()}>{children}</Provider>
);

describe('useSendMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  it('sends message successfully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        chatId: 'chat-123',
        userMessage: 'Hello',
        aiResponse: 'Hi there!',
        timestamp: new Date().toISOString(),
      }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.sendMessage('Hello');
    });

    expect(result.current.isSending).toBe(true);

    await waitFor(() => {
      expect(result.current.isSending).toBe(false);
      expect(result.current.error).toBeNull();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ message: 'Hello' }),
      })
    );
  });

  it('handles network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.sendMessage('Test');
    });

    await waitFor(() => {
      expect(result.current.error).toContain('Network error');
      expect(result.current.isSending).toBe(false);
    });
  });

  it('handles rate limit error (429)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Rate limit exceeded' }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.sendMessage('Test');
    });

    await waitFor(() => {
      expect(result.current.error).toContain('Rate limit');
      expect(result.current.isSending).toBe(false);
    });
  });

  it('validates empty messages', () => {
    const { result } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.sendMessage('');
    });

    expect(result.current.error).toContain('Message is required');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('trims whitespace from messages', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        aiResponse: 'Response',
        timestamp: new Date().toISOString(),
      }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.sendMessage('  Test message  ');
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ message: 'Test message' }),
        })
      );
    });
  });

  it('supports retry functionality', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('First fail'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          aiResponse: 'Success',
          timestamp: new Date().toISOString(),
        }),
      });

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    // First attempt fails
    act(() => {
      result.current.sendMessage('Test');
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    // Retry succeeds
    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.isSending).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('handles abort signal for cancellation', async () => {
    let abortSignal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementation((url, options) => {
      abortSignal = options.signal;
      return new Promise(() => {}); // Never resolves
    });

    const { result, unmount } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.sendMessage('Test');
    });

    // Unmount should trigger abort
    unmount();

    expect(abortSignal?.aborted).toBe(true);
  });

  it('enforces message length limit', () => {
    const { result } = renderHook(() => useSendMessage(), { wrapper });
    
    const longMessage = 'a'.repeat(5001); // Assuming 5000 char limit
    
    act(() => {
      result.current.sendMessage(longMessage);
    });

    expect(result.current.error).toContain('Message too long');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('handles server error (500)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.sendMessage('Test');
    });

    await waitFor(() => {
      expect(result.current.error).toContain('Server error');
    });
  });
});
