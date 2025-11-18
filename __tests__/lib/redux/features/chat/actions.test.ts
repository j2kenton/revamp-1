import { chatActions, ChatActionType } from '@/lib/redux/features/chat/actions';
import type { ChatDTO, MessageDTO } from '@/types/models';

const buildMessage = (overrides: Partial<MessageDTO> = {}): MessageDTO => {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'msg-1',
    chatId: overrides.chatId ?? 'chat-1',
    role: overrides.role ?? 'user',
    content: overrides.content ?? 'Hello',
    status: overrides.status ?? 'sent',
    parentMessageId: overrides.parentMessageId ?? null,
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
};

const buildChat = (overrides: Partial<ChatDTO> = {}): ChatDTO => ({
  id: overrides.id ?? 'chat-1',
  title: overrides.title ?? 'Sample Chat',
  userId: overrides.userId ?? 'user-1',
  archived: overrides.archived ?? false,
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
});

describe('chatActions', () => {
  it('creates addMessage action', () => {
    const message = buildMessage();
    const action = chatActions.addMessage(message.chatId, message);

    expect(action).toEqual({
      type: ChatActionType.ADD_MESSAGE,
      payload: { chatId: message.chatId, message },
    });
  });

  it('creates updateMessage action', () => {
    const action = chatActions.updateMessage('chat-1', 'msg-1', {
      content: 'Updated',
    });

    expect(action).toEqual({
      type: ChatActionType.UPDATE_MESSAGE,
      payload: {
        chatId: 'chat-1',
        messageId: 'msg-1',
        updates: { content: 'Updated' },
      },
    });
  });

  it('creates setChats action', () => {
    const chats = [buildChat(), buildChat({ id: 'chat-2' })];
    const action = chatActions.setChats(chats);

    expect(action).toEqual({
      type: ChatActionType.SET_CHATS,
      payload: chats,
    });
  });

  it('creates optimistic update actions', () => {
    const optimisticUpdate = {
      id: 'tmp-1',
      tempId: 'tmp-1',
      status: 'pending' as const,
      message: buildMessage(),
    };

    expect(chatActions.addOptimisticUpdate(optimisticUpdate)).toEqual({
      type: ChatActionType.ADD_OPTIMISTIC_UPDATE,
      payload: optimisticUpdate,
    });

    expect(chatActions.updateOptimisticUpdate('tmp-1', { status: 'success' })).toEqual({
      type: ChatActionType.UPDATE_OPTIMISTIC_UPDATE,
      payload: { id: 'tmp-1', updates: { status: 'success' } },
    });

    expect(chatActions.removeOptimisticUpdate('tmp-1')).toEqual({
      type: ChatActionType.REMOVE_OPTIMISTIC_UPDATE,
      payload: 'tmp-1',
    });
  });

  it('creates loading and error actions', () => {
    expect(chatActions.setLoading('sendingMessage', true)).toEqual({
      type: ChatActionType.SET_LOADING,
      payload: { key: 'sendingMessage', value: true },
    });

    expect(chatActions.setError('messages', 'Network error')).toEqual({
      type: ChatActionType.SET_ERROR,
      payload: { key: 'messages', error: 'Network error' },
    });
  });
});
