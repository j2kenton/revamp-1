import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useStreamingResponse } from '@/app/chat/hooks/useStreamingResponse';
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

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockDeriveCsrfToken =
  deriveCsrfToken as jest.MockedFunction<typeof deriveCsrfToken>;
const mockIsBypassAuthEnabled =
  isBypassAuthEnabled as jest.MockedFunction<typeof isBypassAuthEnabled>;

const originalFetch = global.fetch;

beforeAll(() => {
  global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
});

afterAll(() => {
  global.fetch = originalFetch;
});

afterEach(() => {
  (global.fetch as jest.Mock).mockReset?.();
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return wrapper;
};

describe('useStreamingResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      user: null,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      isLoading: false,
      error: null,
    });
    mockDeriveCsrfToken.mockResolvedValue('csrf-token');
    mockIsBypassAuthEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_TEST_AUTH_MODE;
  });

  it('streams simulated data in automated test mode', async () => {
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'true';

    const { result } = renderHook(
      () =>
        useStreamingResponse({
          chatId: null,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendStreamingMessage('Hello');
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.isComplete).toBe(true);
      expect(result.current.streamingMessage?.content).toContain('Thanks for your message');
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  it('throws when no authentication token is available', async () => {
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
    mockUseAuth.mockReturnValueOnce({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      isLoading: false,
      error: null,
    });
    mockIsBypassAuthEnabled.mockReturnValue(false);

    const { result } = renderHook(
      () =>
        useStreamingResponse({
          chatId: 'chat-123',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendStreamingMessage('Hello world');
    });

    expect(result.current.error?.message).toBe('Not authenticated');
  });

  it('surface rate limit errors from the API', async () => {
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE = 'false';
    mockUseAuth.mockReturnValueOnce({
      accessToken: 'token',
      user: null,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      isLoading: false,
      error: null,
    });

    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      status: 429,
      ok: false,
      headers: {
        get: () => '5',
      },
      json: async () => ({
        error: { message: 'Too many requests', details: { retryAfter: 5 } },
      }),
    } as unknown as Response);

    const { result } = renderHook(
      () =>
        useStreamingResponse({
          chatId: 'chat-123',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendStreamingMessage('Hello');
    });

    expect(result.current.error?.name).toBe('RateLimitError');
    expect(result.current.rateLimitSeconds).toBe(5);
  });
});
