import { renderHook, waitFor } from '@testing-library/react';
import { useFetchChatHistory } from '@/app/chat/hooks/useFetchChatHistory';
import { Provider } from 'react-redux';
import chatReducer from '@/lib/redux/features/chat/reducer';
import React from 'react';

global.fetch = jest.fn();

const createMockStore = () => {
  return configureStore({
    reducer: {
      chat: chatReducer,
    },
  });
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={createMockStore()}>{children}</Provider>
);

describe('useFetchChatHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches chat history on mount', async () => {
    const mockHistory = [
      { id: '1', role: 'user', content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
      { id: '2', role: 'assistant', content: 'Hi!', timestamp: '2024-01-01T00:00:01Z' },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: mockHistory }),
    });

    const { result } = renderHook(() => useFetchChatHistory('chat-123'), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.messages).toEqual(mockHistory);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/chat-123')
    );
  });

  it('handles fetch errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFetchChatHistory('chat-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('retries on failure with exponential backoff', async () => {
    let attempts = 0;
    (global.fetch as jest.Mock).mockImplementation(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.reject(new Error('Temporary failure'));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ messages: [] }),
      });
    });

    const { result } = renderHook(() => useFetchChatHistory('chat-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBeFalsy();
      expect(attempts).toBe(3);
    }, { timeout: 5000 });
  });

  it('cancels fetch on unmount', () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');
    
    (global.fetch as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { unmount } = renderHook(() => useFetchChatHistory('chat-123'), { wrapper });
    
    unmount();
    
    expect(abortSpy).toHaveBeenCalled();
  });

  it('refreshes history when chatId changes', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: '1', content: 'Chat 1' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: '2', content: 'Chat 2' }] }),
      });

    const { result, rerender } = renderHook(
      ({ chatId }) => useFetchChatHistory(chatId),
      {
        wrapper,
        initialProps: { chatId: 'chat-1' },
      }
    );

    await waitFor(() => {
      expect(result.current.messages[0]?.content).toBe('Chat 1');
    });

    rerender({ chatId: 'chat-2' });

    await waitFor(() => {
      expect(result.current.messages[0]?.content).toBe('Chat 2');
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('deduplicates messages by ID', async () => {
    const duplicatedMessages = [
      { id: '1', content: 'Message 1' },
      { id: '1', content: 'Message 1' }, // Duplicate
      { id: '2', content: 'Message 2' },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: duplicatedMessages }),
    });

    const { result } = renderHook(() => useFetchChatHistory('chat-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages.map((m: any) => m.id)).toEqual(['1', '2']);
    });
  });
});
