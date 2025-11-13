/**
 * SignOutButton Component Tests
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import SignOutButton from './SignOutButton';

// Mock next-auth/react
const signOutMock = jest.fn();
jest.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

describe('SignOutButton', () => {
  beforeEach(() => {
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);
  });

  it('renders sign out button', () => {
    render(<SignOutButton />);

    expect(
      screen.getByRole('button', { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  it('calls signOut with correct callback when clicked', async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);

    const button = screen.getByRole('button', { name: /sign out/i });
    await user.click(button);

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/login' });
  });

  it('handles sign out errors gracefully', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const error = new Error('Sign out failed');
    signOutMock.mockRejectedValue(error);

    render(<SignOutButton />);

    const button = screen.getByRole('button', { name: /sign out/i });
    await user.click(button);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error signing out: Sign out failed',
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles non-Error exceptions', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    signOutMock.mockRejectedValue('String error');

    render(<SignOutButton />);

    const button = screen.getByRole('button', { name: /sign out/i });
    await user.click(button);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error signing out: Unknown error',
    );

    consoleErrorSpy.mockRestore();
  });
});
