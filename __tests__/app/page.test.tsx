import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth/useAuth';
import { STRINGS } from '@/lib/constants/strings';

const mockPush = jest.fn();
const mockLogin = jest.fn<Promise<void>, []>();

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('Home page', () => {
  let HomePage: typeof import('@/app/page').default;

  beforeAll(async () => {
    HomePage = (await import('@/app/page')).default;
  });

  beforeEach(() => {
    mockPush.mockReset();
    mockLogin.mockReset();
    mockLogin.mockResolvedValue(undefined);
    mockUseRouter.mockReturnValue({
      push: mockPush,
    } as unknown as ReturnType<typeof useRouter>);
    mockUseAuth.mockReturnValue({
      status: 'unauthenticated',
      isAuthenticated: false,
      provider: null,
      authIdentityKey: null,
      user: null,
      accessToken: null,
      login: mockLogin,
      logout: jest.fn(),
      acquireToken: jest.fn(),
      acquireGraphToken: jest.fn(),
      isLoading: false,
      error: null,
      needsReauth: false,
      clearError: jest.fn(),
    });
  });

  it('renders the combined landing and sign-in page', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: STRINGS.landing.headline,
      }),
    ).toBeInTheDocument();

    // Microsoft remains a fully functional secondary option (Google is
    // rendered by the real GoogleSignInButton, which no-ops without a
    // configured GoogleAuthProvider ancestor in this unit test).
    expect(
      screen.getByRole('button', { name: STRINGS.landing.secondaryCta }),
    ).toBeInTheDocument();

    for (const feature of STRINGS.landing.features) {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: feature.title,
        }),
      ).toBeInTheDocument();
    }
  });

  it('signs in from the landing page and routes to chat', async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    await user.click(
      screen.getByRole('button', { name: STRINGS.landing.secondaryCta }),
    );

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('microsoft');
    });
    expect(mockPush).toHaveBeenCalledWith('/chat');
  });

  it('shows an inert placeholder instead of a live Google button while resolving', () => {
    mockUseAuth.mockReturnValue({
      status: 'resolving',
      isAuthenticated: false,
      provider: null,
      authIdentityKey: null,
      user: null,
      accessToken: null,
      login: mockLogin,
      logout: jest.fn(),
      acquireToken: jest.fn(),
      acquireGraphToken: jest.fn(),
      isLoading: false,
      error: null,
      needsReauth: false,
      clearError: jest.fn(),
    });

    render(<HomePage />);

    expect(
      screen.queryByTestId('google-signin-button'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('google-signin-placeholder'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: STRINGS.landing.secondaryCta }),
    ).toBeDisabled();
  });
});
