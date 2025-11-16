import { reconcileMessages } from '@/app/chat/utils/messageReconciler';
import type { MessageDTO } from '@/types/models';

const createMessage = (
  id: string,
  status: MessageDTO['status'],
  overrides: Partial<MessageDTO> = {},
): MessageDTO => ({
  id,
  chatId: 'chat-1',
  role: 'user',
  content: 'Test message',
  status,
  parentMessageId: null,
  metadata: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('reconcileMessages', () => {
  it('replaces optimistic message when ids match', () => {
    const optimistic = createMessage('temp-1', 'sending', {
      metadata: { clientRequestId: 'temp-1' },
    });
    const server = createMessage('real-1', 'sent', {
      metadata: { clientRequestId: 'temp-1' },
    });

    const result = reconcileMessages({
      existingMessages: [optimistic],
      incomingMessages: [server],
      clientRequestId: 'temp-1',
      optimisticMessageId: 'temp-1',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('real-1');
  });

  it('keeps both when there is no match', () => {
    const optimistic = createMessage('temp-1', 'sending');
    const server = createMessage('real-2', 'sent');

    const result = reconcileMessages({
      existingMessages: [optimistic],
      incomingMessages: [server],
    });

    expect(result.map((m) => m.id).sort()).toEqual(['temp-1', 'real-2'].sort());
  });

  it('prevents duplicates', () => {
    const message = createMessage('same', 'sent');

    const result = reconcileMessages({
      existingMessages: [message],
      incomingMessages: [message],
    });

    expect(result).toHaveLength(1);
  });

  it('maintains chronological ordering', () => {
    const older = createMessage('old', 'sent', {
      createdAt: new Date('2024-01-01').toISOString(),
      updatedAt: new Date('2024-01-01').toISOString(),
    });
    const newer = createMessage('new', 'sent', {
      createdAt: new Date('2024-01-02').toISOString(),
      updatedAt: new Date('2024-01-02').toISOString(),
    });

    const result = reconcileMessages({
      existingMessages: [newer, older],
      incomingMessages: [],
    });

    expect(result[0].id).toBe('old');
    expect(result[1].id).toBe('new');
  });

  it('handles multiple server messages', () => {
    const optimistic = createMessage('temp', 'sending', {
      metadata: { clientRequestId: 'temp' },
    });
    const serverMessages = [
      createMessage('real-1', 'sent', {
        metadata: { clientRequestId: 'temp' },
      }),
      createMessage('assistant-1', 'sent', { role: 'assistant' }),
    ];

    const result = reconcileMessages({
      existingMessages: [optimistic],
      incomingMessages: serverMessages,
      clientRequestId: 'temp',
      optimisticMessageId: 'temp',
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('real-1');
    expect(result[1].id).toBe('assistant-1');
  });
});
