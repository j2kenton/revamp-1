/**
 * ChatMessage Component Tests
 */

import { render, screen } from '@testing-library/react';
import { ChatMessage } from '@/app/chat/components/ChatMessage';
import type { MessageDTO } from '@/types/models';

describe('ChatMessage', () => {
  const baseMessage: MessageDTO = {
    id: 'msg1',
    chatId: 'chat1',
    role: 'user',
    content: 'Hello, world!',
    status: 'sent',
    parentMessageId: null,
    metadata: null,
    createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
    updatedAt: new Date('2025-01-01T00:00:00Z').toISOString(),
  };

  it('should render user message correctly', () => {
    render(<ChatMessage message={baseMessage} />);

    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('should render assistant message correctly', () => {
    const assistantMessage: MessageDTO = {
      ...baseMessage,
      role: 'assistant',
    };

    render(<ChatMessage message={assistantMessage} />);

    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Assistant')
    );
  });

  it('should display sending status icon', () => {
    const sendingMessage: MessageDTO = {
      ...baseMessage,
      status: 'sending',
    };

    const { container } = render(<ChatMessage message={sendingMessage} />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should display sent status icon', () => {
    render(<ChatMessage message={baseMessage} />);

    const checkmark = screen.getByRole('article').querySelector('svg path');
    expect(checkmark).toBeInTheDocument();
  });

  it('should display failed status icon', () => {
    const failedMessage: MessageDTO = {
      ...baseMessage,
      status: 'failed',
    };

    render(<ChatMessage message={failedMessage} />);

    const errorIcon = screen.getByRole('article').querySelector('svg path');
    expect(errorIcon).toBeInTheDocument();
  });

  it('should display token count when available', () => {
    const messageWithTokens: MessageDTO = {
      ...baseMessage,
      metadata: {
        tokensUsed: 42,
      },
    };

    render(<ChatMessage message={messageWithTokens} />);

    expect(screen.getByText('42 tokens')).toBeInTheDocument();
  });

  it('should not display token count when not available', () => {
    render(<ChatMessage message={baseMessage} />);

    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    render(<ChatMessage message={baseMessage} />);

    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('aria-label');
    expect(article.getAttribute('aria-label')).toContain('You');
  });

  it('should format timestamps correctly', () => {
    render(<ChatMessage message={baseMessage} />);

    // Should show relative time
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });
});
