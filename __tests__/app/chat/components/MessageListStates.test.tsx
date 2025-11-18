import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  MessageListEmptyState,
  type MessageListEmptyStateVariant,
} from '@/app/chat/components/MessageListEmptyState';
import { MessageListLoadingState } from '@/app/chat/components/MessageListLoadingState';
import { MessageListErrorState } from '@/app/chat/components/MessageListErrorState';
import { STRINGS } from '@/lib/constants/strings';

describe('MessageList state components', () => {
  describe('MessageListEmptyState', () => {
    it('renders onboarding state when no chat is selected', () => {
      render(
        <MessageListEmptyState variant={'no-chat' satisfies MessageListEmptyStateVariant} />,
      );

      expect(
        screen.getByRole('heading', { name: STRINGS.chat.emptyState.title }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(STRINGS.chat.emptyState.description),
      ).toBeInTheDocument();
    });

    it('shows passive copy when there are no messages yet', () => {
      render(<MessageListEmptyState />);

      expect(screen.getByText(STRINGS.chat.noMessages)).toBeInTheDocument();
    });
  });

  describe('MessageListLoadingState', () => {
    it('renders skeleton loaders with live status', () => {
      render(<MessageListLoadingState />);

      const skeletons = screen.getAllByRole('status', {
        name: /loading message/i,
      });
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('MessageListErrorState', () => {
    it('presents error details to the user', () => {
      const error = new Error('Failed to load messages');
      render(<MessageListErrorState error={error} />);

      expect(
        screen.getByRole('heading', { name: STRINGS.chat.errorState.title }),
      ).toBeInTheDocument();
      expect(screen.getAllByText(error.message).length).toBeGreaterThan(0);
    });
  });
});
