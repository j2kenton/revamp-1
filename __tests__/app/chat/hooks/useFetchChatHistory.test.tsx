import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useFetchChatHistory } from '@/app/chat/hooks/useFetchChatHistory';
import { useAuth } from '@/lib/auth/useAuth';

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

const originalFetch = global.fetch;
const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

beforeAll(() => {
  global.fetch = fetchMock;
});

afterAll(() => {
  global.fetch = originalFetch;
});

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const baseAuthState = {
  accessToken: 'test-token',
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test User',
  },
  isAuthenticated: true,
  login: jest.fn(),
  logout: jest.fn(),
  acquireToken: jest.fn(),
  isLoading: false,
  error: null,
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return wrapper;
};

describe('useFetchChatHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    mockUseAuth.mockReturnValue(baseAuthState);
  });

  it('fetches chat history when chatId and token are available', async () => {
    const mockMessages = [
      { id: '1', content: 'Hello', role: 'user' },
      { id: '2', content: 'Hi!', role: 'assistant' },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          chat: { id: 'chat-123', title: 'Test Chat' },
          messages: mockMessages,
          pagination: { offset: 0, limit: 50, total: 2, hasMore: false },
        },
      }),
    } as Response);

    const { result } = renderHook(() => useFetchChatHistory('chat-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/chat/chat-123', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.chat?.title).toBe('Test Chat');
  });

  it('dedupes messages with the same id', async () => {
    const duplicatedMessages = [
      { id: '1', content: 'First', role: 'user' },
      { id: '1', content: 'First duplicate', role: 'user' },
      { id: '2', content: 'Second', role: 'assistant' },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          chat: { id: 'chat-1', title: 'Dupes' },
          messages: duplicatedMessages,
          pagination: { offset: 0, limit: 50, total: 2, hasMore: false },
        },
      }),
    } as Response);

    const { result } = renderHook(() => useFetchChatHistory('chat-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });
  });

  it('exposes errors when the request fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { message: '404 Not Found' },
      }),
    } as Response);

    const { result } = renderHook(() => useFetchChatHistory('missing-chat'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });
});
