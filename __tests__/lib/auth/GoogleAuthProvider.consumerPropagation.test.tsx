/**
 * Real-consumer renewal propagation.
 *
 * The review's outstanding completion blocker: `GoogleAuthProvider.test.tsx`
 * proves the state machine's bootstrap/restoration rules against the real
 * `MsalProvider` + `AuthProvider` composition, but a renewed Google credential
 * had only been asserted against the standalone `useAuth()` value — not
 * against the actual chat consumers (`useFetchChatHistory`,
 * `useStreamingResponse`) that depend on a shared token. Because both
 * hooks read `accessToken`/`authIdentityKey` from the same `useAuth()`
 * context value (see `lib/auth/AuthProvider.tsx`'s `useComputedAuth`), a
 * renewal landing in `GoogleAuthProvider`'s state should be visible to all of
 * them on the same render, with no subtree remount (same `authIdentityKey`
 * for a same-`sub` renewal) and with GIS `initialize()` still called at most
 * once despite multiple consumers mounting simultaneously.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { render, renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AccountInfo, AuthenticationResult, EventMessage } from '@azure/msal-browser';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { useAuth } from '@/lib/auth/useAuth';
import { useFetchChatHistory } from '@/app/chat/hooks/useFetchChatHistory';
import { useStreamingResponse } from '@/app/chat/hooks/useStreamingResponse';
import { MsalProvider } from '@/lib/auth/MsalProvider';
import { setAuthProviderMarker, setLastGoogleSub } from '@/lib/auth/authProviderMarker';
import { loadGoogleGsiScript } from '@/lib/auth/googleGsiLoader';
import { resetMsTokenStoreForTests } from '@/lib/auth/msTokenStore';

jest.mock('@/lib/auth/googleGsiLoader', () => ({
  loadGoogleGsiScript: jest.fn(),
}));

const mockLoadGoogleGsiScript = loadGoogleGsiScript as jest.MockedFunction<
  typeof loadGoogleGsiScript
>;

type EventCallback = (message: EventMessage) => void;

interface MockMsalInstance {
  initialize: jest.Mock<Promise<void>, []>;
  initializeWrapperLibrary: jest.Mock<void, unknown[]>;
  handleRedirectPromise: jest.Mock<Promise<AuthenticationResult | null>, []>;
  getAllAccounts: jest.Mock<AccountInfo[], []>;
  getActiveAccount: jest.Mock<AccountInfo | null, []>;
  setActiveAccount: jest.Mock<void, [AccountInfo | null]>;
  addEventCallback: jest.Mock<string, [EventCallback]>;
  removeEventCallback: jest.Mock<void, [string]>;
  getLogger: jest.Mock;
}

jest.mock('@azure/msal-browser', () => {
  const actual = jest.requireActual('@azure/msal-browser');
  const listeners = new Map<string, (message: unknown) => void>();
  let nextId = 0;

  const noopLogger = {
    verbose: () => {},
    info: () => {},
    warning: () => {},
    error: () => {},
    clone: () => noopLogger,
  };

  const instance: MockMsalInstance = {
    initialize: jest.fn(),
    initializeWrapperLibrary: jest.fn(),
    handleRedirectPromise: jest.fn(),
    getAllAccounts: jest.fn(),
    getActiveAccount: jest.fn(),
    setActiveAccount: jest.fn(),
    addEventCallback: jest.fn((cb: EventCallback) => {
      const id = String(nextId++);
      listeners.set(id, cb as (message: unknown) => void);
      return id;
    }),
    removeEventCallback: jest.fn((id: string) => {
      listeners.delete(id);
    }),
    getLogger: jest.fn().mockReturnValue(noopLogger),
  };

  return {
    ...actual,
    PublicClientApplication: jest.fn().mockImplementation(() => instance),
    __mockMsalInstance: instance,
  };
});

const mockMsalInstance = (
  jest.requireMock('@azure/msal-browser') as {
    __mockMsalInstance: MockMsalInstance;
  }
).__mockMsalInstance;

let credentialNonceCounter = 0;

// `nonce` guarantees two credentials minted within the same wall-clock
// second (as in a synchronous restoration-then-renewal test sequence) still
// decode to distinct JWT strings — without it, identical `sub`/`iat`/`exp`
// would make the "renewal changed the token" assertion vacuously true.
function makeCredential(sub: string, email = `${sub}@example.com`): string {
  credentialNonceCounter += 1;
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    sub,
    email,
    email_verified: true,
    name: 'Test User',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    nonce: credentialNonceCounter,
  };
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.signature`;
}

function Wrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <MsalProvider>
        <AuthProvider>{children}</AuthProvider>
      </MsalProvider>
    </QueryClientProvider>
  );
}

describe('Google credential renewal propagation to real chat consumers', () => {
  let promptMock: jest.Mock;
  let gisInitializeMock: jest.Mock;
  let gisCredentialCallback:
    | ((response: { credential: string; select_by?: string }) => void)
    | null;

  let fetchSpy: jest.SpiedFunction<typeof globalThis.fetch>;

  // Minimal well-formed SSE body: one `message_complete` event is enough for
  // useStreamingResponse's read loop to finish without error.
  function sseStreamResponse(): Response {
    const body = 'event: message_complete\ndata: {"messageId":"m1","content":"hi"}\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }

  function mockFetchRouter(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/api/chat/stream')) {
      return Promise.resolve(sseStreamResponse());
    }

    if (url === '/api/chat' && init?.method === 'POST') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              userMessage: {
                id: 'user-1',
                chatId: 'chat-1',
                role: 'user',
                content: 'hi',
                status: 'sent',
                parentMessageId: null,
                metadata: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              aiMessage: {
                id: 'ai-1',
                chatId: 'chat-1',
                role: 'assistant',
                content: 'hello',
                status: 'sent',
                parentMessageId: 'user-1',
                metadata: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              chatId: 'chat-1',
            },
          }),
          { status: 200 },
        ),
      );
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({ data: { chat: null, messages: [], pagination: {} } }),
        { status: 200 },
      ),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    // See GoogleAuthProvider.test.tsx: `AuthProvider` reads the shared
    // msTokenStore singleton, which isn't torn down by unmounting, so a
    // token/error left by an earlier test could otherwise leak here.
    resetMsTokenStoreForTests();
    mockMsalInstance.initialize.mockResolvedValue(undefined);
    mockMsalInstance.handleRedirectPromise.mockResolvedValue(null);
    mockMsalInstance.getAllAccounts.mockReturnValue([]);
    mockMsalInstance.getActiveAccount.mockReturnValue(null);
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(mockFetchRouter);

    mockLoadGoogleGsiScript.mockResolvedValue(undefined);
    promptMock = jest.fn();
    gisCredentialCallback = null;
    gisInitializeMock = jest.fn(
      (config: { callback: (response: { credential: string; select_by?: string }) => void }) => {
        gisCredentialCallback = config.callback;
      },
    );
    (window as unknown as { google?: unknown }).google = {
      accounts: {
        id: {
          initialize: gisInitializeMock,
          prompt: promptMock,
          disableAutoSelect: jest.fn(),
          renderButton: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
    fetchSpy.mockRestore();
  });

  it('propagates a renewed Google credential to useAuth, useFetchChatHistory, and useStreamingResponse simultaneously without remounting, and the hooks send the renewed bearer on the wire', async () => {
    setAuthProviderMarker('google');
    setLastGoogleSub('sub-123');

    const mountCounts = { streaming: 0 };
    const snapshots: Array<{
      accessToken: string | null;
      authIdentityKey: string | null;
    }> = [];
    // Populated from effects (not render) with the latest hook return values,
    // so the test can imperatively drive sendStreamingMessage (and force a
    // history refetch) with whatever token useAuth() is currently exposing.
    const handles: {
      sendStreamingMessage?: ReturnType<
        typeof useStreamingResponse
      >['sendStreamingMessage'];
      refetchHistory?: ReturnType<typeof useFetchChatHistory>['refetch'];
    } = {};

    function Consumer() {
      const auth = useAuth();
      const { refetch: refetchHistory } = useFetchChatHistory('chat-1');
      const { sendStreamingMessage } = useStreamingResponse({ chatId: 'chat-1' });

      useEffect(() => {
        mountCounts.streaming += 1;
      }, []);

      useEffect(() => {
        handles.sendStreamingMessage = sendStreamingMessage;
        handles.refetchHistory = refetchHistory;
      });

      useEffect(() => {
        snapshots.push({
          accessToken: auth.accessToken,
          authIdentityKey: auth.authIdentityKey,
        });
      });

      return null;
    }

    render(
      <Wrapper>
        <Consumer />
      </Wrapper>,
    );

    // Restoration trigger fires (marker 'google' + pinned sub); accept the
    // matching automatic credential to establish the initial session.
    await waitFor(() => {
      expect(gisCredentialCallback).not.toBeNull();
    });
    act(() => {
      gisCredentialCallback!({ credential: makeCredential('sub-123'), select_by: 'auto' });
    });

    await waitFor(() => {
      expect(snapshots.some((s) => s.authIdentityKey === 'google:sub-123')).toBe(true);
    });
    const initialToken = snapshots[snapshots.length - 1].accessToken;
    expect(initialToken).not.toBeNull();
    expect(mountCounts.streaming).toBe(1);

    // GIS initialize() is called at most once even though restoration,
    // renewal, and multiple consumers all funnel through the same
    // ensureInitialized() guard.
    expect(gisInitializeMock).toHaveBeenCalledTimes(1);

    // Prove useFetchChatHistory actually sends the initial token on the
    // wire too — the review's blocker noted this consumer was mounted but
    // never exercised beyond useAuth() exposing the token.
    await waitFor(() => expect(handles.refetchHistory).toBeDefined());
    fetchSpy.mockClear();
    await act(async () => {
      await handles.refetchHistory!();
    });
    const initialHistoryCall = fetchSpy.mock.calls.find(([url]) =>
      String(url) === '/api/chat/chat-1',
    );
    expect(initialHistoryCall).toBeDefined();
    expect(
      (initialHistoryCall![1]?.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${initialToken}`);

    // Prove useStreamingResponse actually sends the initial token on the
    // wire, not just that useAuth() exposes it.
    await waitFor(() => expect(handles.sendStreamingMessage).toBeDefined());
    await act(async () => {
      await handles.sendStreamingMessage!('hi');
    });
    const initialStreamCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/api/chat/stream'),
    );
    expect(initialStreamCall).toBeDefined();
    expect(
      (initialStreamCall![1]?.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${initialToken}`);

    fetchSpy.mockClear();

    // Simulate the pre-expiry renewal trigger firing a fresh credential for
    // the SAME subject — same identity, new token value.
    act(() => {
      gisCredentialCallback!({ credential: makeCredential('sub-123'), select_by: 'auto' });
    });

    await waitFor(() => {
      const latest = snapshots[snapshots.length - 1];
      expect(latest.accessToken).not.toBeNull();
      expect(latest.accessToken).not.toBe(initialToken);
    });

    const latest = snapshots[snapshots.length - 1];
    const renewedToken = latest.accessToken;
    // Same-sub renewal must not change the identity key (no remount trigger).
    expect(latest.authIdentityKey).toBe('google:sub-123');
    // The subtree was never unmounted/remounted across the renewal.
    expect(mountCounts.streaming).toBe(1);
    // Still only one GIS initialize() call across restoration + renewal.
    expect(gisInitializeMock).toHaveBeenCalledTimes(1);

    // The review's outstanding blocker: prove the RENEWED token — not just
    // the initial one — is what actually goes out on the wire from both
    // real chat consumers (history, streaming), with no remount required
    // to pick it up.
    await act(async () => {
      await handles.refetchHistory!();
    });
    const renewedHistoryCall = fetchSpy.mock.calls.find(([url]) =>
      String(url) === '/api/chat/chat-1',
    );
    expect(renewedHistoryCall).toBeDefined();
    expect(
      (renewedHistoryCall![1]?.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${renewedToken}`);

    await act(async () => {
      await handles.sendStreamingMessage!('hi again');
    });
    const renewedStreamCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/api/chat/stream'),
    );
    expect(renewedStreamCall).toBeDefined();
    expect(
      (renewedStreamCall![1]?.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${renewedToken}`);
  });

  it('does not authenticate any consumer, and issues no GIS initialize(), when Google is not the active provider', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current?.status).toBe('unauthenticated');
    });
    expect(gisInitializeMock).not.toHaveBeenCalled();
  });
});
