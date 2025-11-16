import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Module mocks
const pushMock = jest.fn();
const refreshMock = jest.fn();
const loginMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    login: loginMock,
    isLoading: false,
    error: null,
  }),
}));

import LoginPage from './page';

describe('LoginPage', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    loginMock.mockReset();
  });

  it('renders sign in button', () => {
    render(<LoginPage />);

    expect(
      screen.getByRole('button', { name: /sign in with microsoft/i }),
    ).toBeInTheDocument();
  });

  it('calls login when button is clicked', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const button = screen.getByRole('button', {
      name: /sign in with microsoft/i,
    });
    await user.click(button);

    expect(loginMock).toHaveBeenCalled();
  });
});
