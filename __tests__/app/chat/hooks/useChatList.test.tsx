import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useChatList } from '@/app/chat/hooks/useChatList';
import { chatListQueryKey } from '@/app/chat/utils/chatQueryKey';
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
  status: 'authenticated' as const,
  accessToken: 'test-token',
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test User',
  },
  isAuthenticated: true,
  provider: 'microsoft' as const,
  authIdentityKey: 'microsoft:user-1',
  login: jest.fn(),
  logout: jest.fn(),
  acquireToken: jest.fn(),
  acquireGraphToken: jest.fn(),
  isLoading: false,
  error: null,
  needsReauth: false,
  clearError: jest.fn(),
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      // The hook owns its retry count. A zero delay keeps that production
      // behavior intact while making the terminal error observable in tests.
      queries: { retry: false, retryDelay: 0 },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { wrapper, queryClient };
};

const mockChats = [
  {
    id: 'chat-2',
    userId: 'user-1',
    title: 'Newer chat',
    archived: false,
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
  },
  {
    id: 'chat-1',
    userId: 'user-1',
    title: 'Older chat',
    archived: false,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
  },
];

describe('useChatList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    mockUseAuth.mockReturnValue(baseAuthState);
  });

  it('fetches the chat list when a token is available', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { chats: mockChats } }),
    } as Response);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useChatList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/chat', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(result.current.chats.map((chat) => chat.id)).toEqual([
      'chat-2',
      'chat-1',
    ]);
  });

  it('namespaces the query key by authIdentityKey', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { chats: mockChats } }),
    } as Response);

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useChatList(), { wrapper });

    await waitFor(() => {
      expect(result.current.chats).toHaveLength(2);
    });

    expect(
      queryClient.getQueryData(chatListQueryKey('microsoft:user-1')),
    ).toEqual({ chats: mockChats });
    expect(
      queryClient.getQueryData(chatListQueryKey('google:someone-else')),
    ).toBeUndefined();
    expect(queryClient.getQueryData(chatListQueryKey(null))).toBeUndefined();
  });

  it('does not fetch without an access token', async () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      status: 'unauthenticated' as const,
      isAuthenticated: false,
      accessToken: null,
      user: null,
      authIdentityKey: null,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useChatList(), { wrapper });

    // Give any accidental fetch a chance to fire before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.chats).toEqual([]);
  });

  it('exposes errors when the request fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Boom' } }),
    } as Response);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useChatList(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error?.message).toBe('Boom');
  });
});
