/**
 * `LandingSignInButton` renders Google "first/above" as the primary,
 * more prominent option (see the comment directly above the Google button
 * wrapper in the component) with Microsoft as the secondary option below
 * it. This test pins that DOM order so a future reorder regresses loudly
 * rather than only being caught by eyeballing the rendered page.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { LandingSignInButton } from '@/components/landing/LandingSignInButton';
import { useAuth } from '@/lib/auth/useAuth';
import {
  useGoogleAuth,
  type GoogleAuthContextValue,
} from '@/lib/auth/GoogleAuthProvider';
import { STRINGS } from '@/lib/constants/strings';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/auth/GoogleAuthProvider', () => ({
  useGoogleAuth: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
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

describe('LandingSignInButton DOM order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    mockUseAuth.mockReturnValue({
      status: 'unauthenticated',
      isAuthenticated: false,
      provider: null,
      authIdentityKey: null,
      user: null,
      accessToken: null,
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      acquireGraphToken: jest.fn(),
      isLoading: false,
      error: null,
      needsReauth: false,
      clearError: jest.fn(),
    });
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
    render(<LandingSignInButton />);

    const googleButton = screen.getByTestId('google-signin-button');
    const microsoftButton = screen.getByRole('button', {
      name: STRINGS.landing.secondaryCta,
    });

    // DOCUMENT_POSITION_FOLLOWING (4) means `microsoftButton` comes after
    // `googleButton` in the DOM — i.e. Google precedes Microsoft.
    expect(
      googleButton.compareDocumentPosition(microsoftButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the Google placeholder before the Microsoft option while resolving (rule 0)', () => {
    mockUseAuth.mockReturnValue({
      status: 'resolving',
      isAuthenticated: false,
      provider: null,
      authIdentityKey: null,
      user: null,
      accessToken: null,
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      acquireGraphToken: jest.fn(),
      isLoading: false,
      error: null,
      needsReauth: false,
      clearError: jest.fn(),
    });

    render(<LandingSignInButton />);

    const googlePlaceholder = screen.getByTestId('google-signin-placeholder');
    const microsoftButton = screen.getByRole('button', {
      name: STRINGS.landing.secondaryCta,
    });

    expect(
      googlePlaceholder.compareDocumentPosition(microsoftButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('LandingSignInButton Google script-load retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    mockUseAuth.mockReturnValue({
      status: 'unauthenticated',
      isAuthenticated: false,
      provider: null,
      authIdentityKey: null,
      user: null,
      accessToken: null,
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      acquireGraphToken: jest.fn(),
      isLoading: false,
      error: null,
      needsReauth: false,
      clearError: jest.fn(),
    });
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

    render(<LandingSignInButton />);

    // GoogleSignInButton's `ensureInitialized()` rejects on mount, and its
    // `onError` bubbles up to `LandingSignInButton`'s `googleLoadError`
    // state, surfacing an alert with a retry control.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(STRINGS.errors.googleScriptLoadFailed);
    const retryButton = screen.getByRole('button', {
      name: STRINGS.actions.retry,
    });

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
});

describe('LandingSignInButton dismiss control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
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

  it('shows a dismiss control for a sticky Google credential-rejection error and clears it via clearError()', async () => {
    const user = userEvent.setup();
    const clearError = jest.fn();
    mockUseAuth.mockReturnValue({
      status: 'unauthenticated',
      isAuthenticated: false,
      provider: null,
      authIdentityKey: null,
      user: null,
      accessToken: null,
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      acquireGraphToken: jest.fn(),
      isLoading: false,
      error: new Error('Google account email is not verified.'),
      needsReauth: false,
      clearError,
    });

    render(<LandingSignInButton />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Google account email is not verified.');
    const dismissButton = screen.getByRole('button', {
      name: STRINGS.actions.dismiss,
    });

    await user.click(dismissButton);

    expect(clearError).toHaveBeenCalledTimes(1);
  });

  it('does not show the dismiss control for a script-load failure (that alert has its own retry control)', async () => {
    mockUseAuth.mockReturnValue({
      status: 'unauthenticated',
      isAuthenticated: false,
      provider: null,
      authIdentityKey: null,
      user: null,
      accessToken: null,
      login: jest.fn(),
      logout: jest.fn(),
      acquireToken: jest.fn(),
      acquireGraphToken: jest.fn(),
      isLoading: false,
      error: null,
      needsReauth: false,
      clearError: jest.fn(),
    });
    mockUseGoogleAuth.mockReturnValue(
      createGoogleAuthValue({
        ensureInitialized: jest
          .fn()
          .mockRejectedValue(new Error('Failed to load the Google script')),
      }),
    );

    render(<LandingSignInButton />);

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
