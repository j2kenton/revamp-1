/**
 * `ChatSignInPrompt` renders Google "first/above" as the primary, more
 * prominent option (matching `LandingSignInButton`'s ordering) with
 * Microsoft below it. This test pins that DOM order, plus the same
 * script-load failure/retry contract `LandingSignInButton` has.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatSignInPrompt } from '@/app/chat/components/ChatSignInPrompt';
import {
  useGoogleAuth,
  type GoogleAuthContextValue,
} from '@/lib/auth/GoogleAuthProvider';
import { STRINGS } from '@/lib/constants/strings';

jest.mock('@/lib/auth/GoogleAuthProvider', () => ({
  useGoogleAuth: jest.fn(),
}));

const mockUseGoogleAuth = useGoogleAuth as jest.MockedFunction<
  typeof useGoogleAuth
>;

const createGoogleAuthValue = (
  overrides: Partial<GoogleAuthContextValue> = {},
): GoogleAuthContextValue => ({
  isConfigured: true,
  isReady: true,
  isRestoring: false,
  credential: null,
  idToken: null,
  isExpired: false,
  needsReauth: false,
  error: null,
  ensureInitialized: jest.fn().mockResolvedValue(undefined),
  requestCredential: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn(),
  clearError: jest.fn(),
  ...overrides,
});

describe('ChatSignInPrompt DOM order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGoogleAuth.mockReturnValue(createGoogleAuthValue());
    (window as unknown as { google?: unknown }).google = {
      accounts: {
        id: {
          renderButton: jest.fn(),
          initialize: jest.fn(),
          prompt: jest.fn(),
          disableAutoSelect: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
  });

  it('renders the Google option before the Microsoft option in DOM order', () => {
    render(
      <ChatSignInPrompt onLogin={jest.fn()} isLoading={false} isResolving={false} />,
    );

    const googleButton = screen.getByTestId('google-signin-button');
    const microsoftButton = screen.getByRole('button', {
      name: STRINGS.auth.signInButton,
    });

    expect(
      googleButton.compareDocumentPosition(microsoftButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the Google placeholder before the Microsoft option while resolving (rule 0)', () => {
    render(
      <ChatSignInPrompt onLogin={jest.fn()} isLoading={false} isResolving />,
    );

    const googlePlaceholder = screen.getByTestId('google-signin-placeholder');
    const microsoftButton = screen.getByRole('button', {
      name: STRINGS.auth.signInButton,
    });

    expect(
      googlePlaceholder.compareDocumentPosition(microsoftButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('ChatSignInPrompt Google script-load retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (window as unknown as { google?: unknown }).google = {
      accounts: {
        id: {
          renderButton: jest.fn(),
          initialize: jest.fn(),
          prompt: jest.fn(),
          disableAutoSelect: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
  });

  it('surfaces a script-load failure with a retry control, and a successful retry clears the error', async () => {
    const user = userEvent.setup();
    const loadError = new Error('Failed to load the Google script');
    const ensureInitialized = jest
      .fn()
      .mockRejectedValueOnce(loadError)
      .mockResolvedValueOnce(undefined);
    mockUseGoogleAuth.mockReturnValue(
      createGoogleAuthValue({ ensureInitialized }),
    );

    render(
      <ChatSignInPrompt onLogin={jest.fn()} isLoading={false} isResolving={false} />,
    );

    // GoogleSignInButton's `ensureInitialized()` rejects on mount, and its
    // `onError` bubbles up to `ChatSignInPrompt`'s `googleLoadError` state,
    // surfacing an alert with a retry control — Microsoft stays usable.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(STRINGS.errors.googleScriptLoadFailed);
    const retryButton = screen.getByRole('button', {
      name: STRINGS.actions.retry,
    });
    expect(
      screen.getByRole('button', { name: STRINGS.auth.signInButton }),
    ).toBeEnabled();

    expect(ensureInitialized).toHaveBeenCalledTimes(1);

    // Activating retry remounts `GoogleSignInButton` (via `key={retryToken}`)
    // and re-attempts initialization.
    await user.click(retryButton);

    await waitFor(() => {
      expect(ensureInitialized).toHaveBeenCalledTimes(2);
    });

    // The retry succeeded — the error clears and the alert disappears.
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('shows the Google script-load failure copy, not the raw auth error message, when both are present', async () => {
    const loadError = new Error('Failed to load the Google script');
    const ensureInitialized = jest.fn().mockRejectedValueOnce(loadError);
    mockUseGoogleAuth.mockReturnValue(
      createGoogleAuthValue({ ensureInitialized }),
    );

    render(
      <ChatSignInPrompt
        onLogin={jest.fn()}
        isLoading={false}
        isResolving={false}
        errorMessage="Failed to load Google Identity Services."
      />,
    );

    // `errorMessage` is already truthy on the very first render (it's a
    // synchronous prop), so an alert showing that raw text exists before
    // `GoogleSignInButton`'s `ensureInitialized()` rejection has propagated
    // up to `googleLoadError` state — `findByRole` would match that first,
    // pre-precedence render. `waitFor` instead polls until the DOM settles
    // into the final, precedence-correct state.
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(STRINGS.errors.googleScriptLoadFailed);
      expect(alert).not.toHaveTextContent(
        'Failed to load Google Identity Services.',
      );
    });
  });
});

describe('ChatSignInPrompt dismiss control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGoogleAuth.mockReturnValue(createGoogleAuthValue());
    (window as unknown as { google?: unknown }).google = {
      accounts: {
        id: {
          renderButton: jest.fn(),
          initialize: jest.fn(),
          prompt: jest.fn(),
          disableAutoSelect: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
  });

  it('shows a dismiss control for a sticky Google credential-rejection error and invokes onDismissError', async () => {
    const user = userEvent.setup();
    const onDismissError = jest.fn();

    render(
      <ChatSignInPrompt
        onLogin={jest.fn()}
        isLoading={false}
        isResolving={false}
        errorMessage="Google account email is not verified."
        onDismissError={onDismissError}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Google account email is not verified.');
    const dismissButton = screen.getByRole('button', {
      name: STRINGS.actions.dismiss,
    });

    await user.click(dismissButton);

    expect(onDismissError).toHaveBeenCalledTimes(1);
  });

  it('does not show the dismiss control when no onDismissError handler is provided', () => {
    render(
      <ChatSignInPrompt
        onLogin={jest.fn()}
        isLoading={false}
        isResolving={false}
        errorMessage="Google account email is not verified."
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: STRINGS.actions.dismiss }),
    ).not.toBeInTheDocument();
  });

  it('does not show the dismiss control for a script-load failure (that alert has its own retry control)', async () => {
    const onDismissError = jest.fn();
    mockUseGoogleAuth.mockReturnValue(
      createGoogleAuthValue({
        ensureInitialized: jest
          .fn()
          .mockRejectedValue(new Error('Failed to load the Google script')),
      }),
    );

    render(
      <ChatSignInPrompt
        onLogin={jest.fn()}
        isLoading={false}
        isResolving={false}
        onDismissError={onDismissError}
      />,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(STRINGS.errors.googleScriptLoadFailed);
    expect(
      screen.getByRole('button', { name: STRINGS.actions.retry }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: STRINGS.actions.dismiss }),
    ).not.toBeInTheDocument();
  });
});
