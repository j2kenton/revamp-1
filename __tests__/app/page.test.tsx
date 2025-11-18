import { render, screen } from '@testing-library/react';
import type { SessionContextValue } from 'next-auth/react';
import HomePage from '@/app/page';
import { useSession } from 'next-auth/react';

jest.mock('next/image', () => {
  const NextImageMock = (props: Record<string, unknown>) => (
    <img alt={props.alt as string} />
  );
  NextImageMock.displayName = 'NextImageMock';
  return NextImageMock;
});

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/components/AuthStatus', () => ({
  AuthStatus: ({ status }: { status: string }) => (
    <div data-testid="auth-status">{status}</div>
  ),
}));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: jest.fn(),
    } as SessionContextValue);
  });

  it('renders hero headline and description', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { name: /next\.js app with authentication/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/built with next\.js 14/i)).toBeInTheDocument();
  });

  it('passes session status to AuthStatus component', () => {
    render(<HomePage />);

    expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
  });
});
