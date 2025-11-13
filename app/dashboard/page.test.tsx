/**
 * Dashboard Page Tests
 *
 * Tests for the server-rendered dashboard page with middleware protection.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock next-auth
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
  default: jest.fn(),
}));

// Mock the authOptions from the route handler
jest.mock('@/app/api/auth/[...nextauth]/route', () => ({
  authOptions: {
    providers: [],
    session: { strategy: 'jwt' },
  },
}));

// Mock next/navigation
const redirectMock = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

// Mock child components
jest.mock('./SignOutButton', () => {
  return function SignOutButton() {
    return <button data-testid="sign-out-button">Sign Out</button>;
  };
});

jest.mock('./GoHomeButton', () => {
  return function GoHomeButton() {
    return <button data-testid="go-home-button">Go to Home</button>;
  };
});

import { getServerSession } from 'next-auth';
import DashboardPage from './page';

const getServerSessionMock = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;

describe('DashboardPage', () => {
  beforeEach(() => {
    redirectMock.mockReset();
    getServerSessionMock.mockReset();
  });

  it('renders dashboard with user information when authenticated', async () => {
    // Mock authenticated session
    getServerSessionMock.mockResolvedValue({
      user: {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
      },
      expires: '2025-12-31',
    });

    // Render the async Server Component
    const DashboardElement = await DashboardPage();
    render(DashboardElement);

    // Check that user information is displayed
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText(/✓ authenticated/i)).toBeInTheDocument();
  });

  it('renders dashboard without name when name is not provided', async () => {
    // Mock authenticated session without name
    getServerSessionMock.mockResolvedValue({
      user: {
        id: '456',
        email: 'noname@example.com',
        name: undefined,
      },
      expires: '2025-12-31',
    });

    const DashboardElement = await DashboardPage();
    render(DashboardElement);

    expect(screen.getByText('456')).toBeInTheDocument();
    expect(screen.getByText('noname@example.com')).toBeInTheDocument();
    // Name section should not be rendered
    expect(screen.queryByText(/name:/i)).not.toBeInTheDocument();
  });

  it('renders action buttons', async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        id: '789',
        email: 'user@example.com',
        name: 'User',
      },
      expires: '2025-12-31',
    });

    const DashboardElement = await DashboardPage();
    render(DashboardElement);

    // Check that buttons are rendered
    expect(screen.getByTestId('sign-out-button')).toBeInTheDocument();
    expect(screen.getByTestId('go-home-button')).toBeInTheDocument();
  });

  it('displays NextAuth success message', async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        id: '999',
        email: 'success@example.com',
        name: 'Success',
      },
      expires: '2025-12-31',
    });

    const DashboardElement = await DashboardPage();
    render(DashboardElement);

    expect(
      screen.getByText(/🎉 NextAuth\.js is working!/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/this is a protected route/i)).toBeInTheDocument();
  });

  it('redirects to login when session is null (defense-in-depth)', async () => {
    // Mock unauthenticated session (should not happen due to middleware, but test defense-in-depth)
    getServerSessionMock.mockResolvedValue(null);

    // Mock redirect to throw (simulating Next.js behavior)
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT: ${url}`);
    });

    // Call the component (redirect will throw)
    await expect(async () => {
      await DashboardPage();
    }).rejects.toThrow('NEXT_REDIRECT: /login');

    // Verify redirect was called
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });
});
