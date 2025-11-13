/**
 * GoHomeButton Component Tests
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import GoHomeButton from './GoHomeButton';

// Mock next/navigation
const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('GoHomeButton', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('renders go to home button', () => {
    render(<GoHomeButton />);

    expect(
      screen.getByRole('button', { name: /go to home/i }),
    ).toBeInTheDocument();
  });

  it('navigates to home page when clicked', async () => {
    const user = userEvent.setup();
    render(<GoHomeButton />);

    const button = screen.getByRole('button', { name: /go to home/i });
    await user.click(button);

    expect(pushMock).toHaveBeenCalledWith('/');
  });

  it('has correct accessibility attributes', () => {
    render(<GoHomeButton />);

    const button = screen.getByRole('button', { name: /go to home/i });

    expect(button).toHaveClass(
      'rounded-md',
      'bg-gray-600',
      'px-6',
      'py-2',
      'text-white',
    );
  });
});
