import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatErrorBoundary } from '@/app/chat/components/ChatErrorBoundary';

// Component that throws an error for testing
const ThrowError: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('ChatErrorBoundary', () => {
  // Suppress console.error for error boundary tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <ChatErrorBoundary>
        <div>Test content</div>
      </ChatErrorBoundary>,
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders error UI when child component throws', () => {
    render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it('resets error state when Try Again is clicked', () => {
    const { rerender } = render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>,
    );

    const retryButton = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryButton);

    rerender(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ChatErrorBoundary>,
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('handles async errors in useEffect', () => {
    const AsyncError: React.FC = () => {
      React.useEffect(() => {
        throw new Error('Async error');
      }, []);
      return <div>Loading</div>;
    };

    render(
      <ChatErrorBoundary>
        <AsyncError />
      </ChatErrorBoundary>,
    );

    // Error boundaries catch errors in lifecycle methods
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('displays custom error message when provided', () => {
    const CustomError: React.FC = () => {
      throw new Error('Custom validation failed');
    };

    render(
      <ChatErrorBoundary errorMessage="Custom error occurred">
        <CustomError />
      </ChatErrorBoundary>,
    );

    expect(screen.getByText(/custom error occurred/i)).toBeInTheDocument();
  });

  it('logs error details in development', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error');

    render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>,
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
