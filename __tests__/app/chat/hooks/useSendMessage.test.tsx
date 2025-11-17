import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  RateLimitError,
  useSendMessage,
} from '@/app/chat/hooks/useSendMessage';
import { useAuth } from '@/lib/auth/useAuth';
import { deriveCsrfToken } from '@/lib/auth/csrf';
import { isBypassAuthEnabled } from '@/lib/auth/bypass';

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/auth/csrf', () => ({
  deriveCsrfToken: jest.fn(),
}));

jest.mock('@/lib/auth/bypass', () => ({
  isBypassAuthEnabled: jest.fn(),
  BYPASS_ACCESS_TOKEN: 'bypass-access-token',
  BYPASS_CSRF_TOKEN: 'bypass-csrf-token',
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
const mockDeriveCsrfToken =
  deriveCsrfToken as jest.MockedFunction<typeof deriveCsrfToken>;
const mockIsBypassAuthEnabled =
  isBypassAuthEnabled as jest.MockedFunction<typeof isBypassAuthEnabled>;

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

const buildFetchResponse = (
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response =>
  ({
    ok: !init.status || init.status < 400,
    status: init.status ?? 200,
    headers: new Headers(init.headers),
    json: async () => body,
  } as unknown as Response);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return wrapper;
};

describe('useSendMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    mockUseAuth.mockReturnValue(baseAuthState);
    mockDeriveCsrfToken.mockResolvedValue('csrf-token');
    mockIsBypassAuthEnabled.mockReturnValue(false);
  });

  it('sends a message successfully', async () => {
    fetchMock.mockResolvedValueOnce(
      buildFetchResponse({
        data: {
          chatId: 'chat-123',
          userMessage: {
            id: 'user-1',
            chatId: 'chat-123',
            role: 'user',
            content: 'Hello',
            status: 'sent',
            parentMessageId: null,
            metadata: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          aiMessage: {
            id: 'ai-1',
            chatId: 'chat-123',
            role: 'assistant',
            content: 'Hi!',
            status: 'sent',
            parentMessageId: 'user-1',
            metadata: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      }),
    );

    const { result } = renderHook(() => useSendMessage('chat-123'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.sendMessage({ content: 'Hello', chatId: 'chat-123' });
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${baseAuthState.accessToken}`,
          'X-CSRF-Token': 'csrf-token',
        }),
      }),
    );
  });

  it('surfaces rate limit errors with retry metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      buildFetchResponse(
        {
          error: {
            message: 'Too many requests',
            details: { retryAfter: 7 },
          },
        },
        {
          status: 429,
          headers: { 'Retry-After': '7' },
        },
      ),
    );

    const { result } = renderHook(() => useSendMessage('chat-123'), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.sendMessage({
          content: 'Hello',
          chatId: 'chat-123',
        });
      }),
    ).rejects.toThrow(RateLimitError);

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(RateLimitError);
    });
  });

  it('throws when no authentication token is available', async () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      accessToken: null,
      isAuthenticated: false,
    });

    const { result } = renderHook(() => useSendMessage('chat-123'), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.sendMessage({
          content: 'Hello',
          chatId: 'chat-123',
        });
      }),
    ).rejects.toThrow('Not authenticated');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
