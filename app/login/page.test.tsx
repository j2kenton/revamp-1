import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Module mocks
const pushMock = jest.fn();
const refreshMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const signInMock = jest.fn();
jest.mock('next-auth/react', () => ({
  // Keep other exports untouched if needed in future
  __esModule: true,
  signIn: (...args: unknown[]) => signInMock(...args),
}));

import LoginPage from './page';

describe('LoginPage', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    signInMock.mockReset();
  });

  it('renders email and password fields and submit button', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it('shows validation errors when fields are empty', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const button = screen.getByRole('button', { name: /sign in/i });
    await user.click(button);

    await screen.findByText(/email is required/i);
    await screen.findByText(/password is required/i);

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'notanemail');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await screen.findByText(/please enter a valid email address/i);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('shows validation error for short password', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(
      screen.getByLabelText(/email address/i),
      'test@example.com',
    );
    await user.type(screen.getByLabelText(/password/i), '123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await screen.findByText(/password must be at least 6 characters/i);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('shows error when credentials are invalid', async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValueOnce({
      ok: false,
      error: 'Invalid credentials',
    });

    render(<LoginPage />);

    await user.type(
      screen.getByLabelText(/email address/i),
      'wrong@example.com',
    );
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await screen.findByText(/invalid email or password/i);

    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('navigates to dashboard on successful login', async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValueOnce({ ok: true, error: null });

    render(<LoginPage />);

    await user.type(
      screen.getByLabelText(/email address/i),
      'demo@example.com',
    );
    await user.type(screen.getByLabelText(/password/i), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('disables button and shows loading text while submitting', async () => {
    const user = userEvent.setup();
    // Keep the promise pending for a bit to assert loading state
    let resolveFn!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFn = resolve as (v: unknown) => void;
    });
    signInMock.mockReturnValueOnce(pending);

    render(<LoginPage />);

    await user.type(
      screen.getByLabelText(/email address/i),
      'demo@example.com',
    );
    await user.type(screen.getByLabelText(/password/i), 'password');

    const button = screen.getByRole('button', { name: /sign in/i });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/signing in/i);

    // resolve the pending signIn
    resolveFn({ ok: true, error: null });

    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
