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

    expect(screen.getByRole('heading', { name: /we hit a snag/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry chat/i })).toBeInTheDocument();
    expect(screen.getByText(/test error/i)).toBeInTheDocument();
  });

  it('invokes onReset when Retry chat is clicked', () => {
    const onReset = jest.fn();
    render(
      <ChatErrorBoundary onReset={onReset}>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /retry chat/i }));
    expect(onReset).toHaveBeenCalled();
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
    expect(screen.getByRole('heading', { name: /we hit a snag/i })).toBeInTheDocument();
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
