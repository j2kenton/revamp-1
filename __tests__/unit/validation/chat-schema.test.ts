import { z } from 'zod';
import { chatMessageSchema } from '@/lib/validation/chat.schema';

describe('chatMessageSchema', () => {
  it('accepts minimal valid payload', () => {
    const data = { content: 'hello world' };
    const parsed = chatMessageSchema.parse(data);
    expect(parsed.content).toBe('hello world');
  });

  it('rejects empty content', () => {
    expect(() => chatMessageSchema.parse({ content: '' })).toThrow(z.ZodError);
  });

  it('rejects content over 4000 chars', () => {
    const long = 'a'.repeat(4001);
    expect(() => chatMessageSchema.parse({ content: long })).toThrow(
      z.ZodError,
    );
  });

  it('allows optional chatId and idempotencyKey', () => {
    const data = {
      content: 'msg',
      chatId: 'chat-123',
      idempotencyKey: 'idem-1',
    };
    const parsed = chatMessageSchema.parse(data);
    expect(parsed.chatId).toBe('chat-123');
    expect(parsed.idempotencyKey).toBe('idem-1');
  });
});
