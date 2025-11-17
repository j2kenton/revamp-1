import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageListEmptyState } from '@/app/chat/components/MessageListEmptyState';
import { MessageListLoadingState } from '@/app/chat/components/MessageListLoadingState';
import { MessageListErrorState } from '@/app/chat/components/MessageListErrorState';

describe('MessageList State Components', () => {
  describe('MessageListEmptyState', () => {
    it('renders empty state with prompt', () => {
      render(<MessageListEmptyState />);

      expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
      expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
    });

    it('provides suggestions for starting', () => {
      render(<MessageListEmptyState />);

      const suggestions = screen.getAllByRole('button');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('triggers onSuggestionClick callback', () => {
      const handleClick = jest.fn();
      render(<MessageListEmptyState onSuggestionClick={handleClick} />);

      const suggestion = screen.getAllByRole('button')[0];
      fireEvent.click(suggestion);

      expect(handleClick).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('MessageListLoadingState', () => {
    it('renders loading skeletons', () => {
      render(<MessageListLoadingState />);

      const skeletons = screen.getAllByTestId('message-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows accessible loading indicator', () => {
      render(<MessageListLoadingState />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByLabelText(/loading messages/i)).toBeInTheDocument();
    });
  });

  describe('MessageListErrorState', () => {
    it('displays error message', () => {
      render(<MessageListErrorState error="Failed to load messages" />);

      expect(screen.getByText(/failed to load messages/i)).toBeInTheDocument();
    });

    it('provides retry button', () => {
      const handleRetry = jest.fn();
      render(
        <MessageListErrorState error="Network error" onRetry={handleRetry} />,
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(handleRetry).toHaveBeenCalled();
    });

    it('shows generic error when message is missing', () => {
      render(<MessageListErrorState />);

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });
});
