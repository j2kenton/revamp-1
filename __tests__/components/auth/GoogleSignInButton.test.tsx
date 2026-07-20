import { render, screen, waitFor } from '@testing-library/react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import {
  useGoogleAuth,
  type GoogleAuthContextValue,
} from '@/lib/auth/GoogleAuthProvider';

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
  isReady: false,
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

describe('GoogleSignInButton', () => {
  const renderButtonMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (window as unknown as { google?: unknown }).google = {
      accounts: {
        id: {
          renderButton: renderButtonMock,
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

  it('renders nothing and warns when Google sign-in is not configured', () => {
    mockUseGoogleAuth.mockReturnValue(
      createGoogleAuthValue({ isConfigured: false }),
    );
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { container } = render(<GoogleSignInButton />);

    expect(container).toBeEmptyDOMElement();
    expect(warnSpy).toHaveBeenCalled();
    expect(renderButtonMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('renders the GIS button once initialization resolves', async () => {
    mockUseGoogleAuth.mockReturnValue(createGoogleAuthValue());

    render(<GoogleSignInButton />);

    await waitFor(() => {
      expect(renderButtonMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('google-signin-button')).toBeInTheDocument();
  });

  it('calls onError when initialization fails (e.g. script load failure)', async () => {
    const error = new Error('boom');
    mockUseGoogleAuth.mockReturnValue(
      createGoogleAuthValue({
        ensureInitialized: jest.fn().mockRejectedValue(error),
      }),
    );

    const onError = jest.fn();
    render(<GoogleSignInButton onError={onError} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });
    expect(renderButtonMock).not.toHaveBeenCalled();
  });
});
