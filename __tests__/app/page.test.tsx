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
    } as ReturnType<typeof useRouter>);
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      login: mockLogin,
      logout: jest.fn(),
      acquireToken: jest.fn(),
      isLoading: false,
      error: null,
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

    expect(
      screen.getByRole('button', { name: STRINGS.landing.primaryCta }),
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
      screen.getByRole('button', { name: STRINGS.landing.primaryCta }),
    );

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });
    expect(mockPush).toHaveBeenCalledWith('/chat');
  });
});
