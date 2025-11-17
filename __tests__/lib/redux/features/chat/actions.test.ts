import { configureStore } from '@reduxjs/toolkit';
import chatReducer from '@/lib/redux/features/chat/reducer';
import {
  addMessage,
  updateMessage,
  deleteMessage,
  clearMessages,
  setLoading,
  setError,
  setStreamingMessage,
  completeStreaming,
} from '@/lib/redux/features/chat/actions';

describe('Chat Redux Actions', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        chat: chatReducer,
      },
    });
  });

  describe('addMessage', () => {
    it('adds a new message to the store', () => {
      const message = {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      store.dispatch(addMessage(message));

      const state = store.getState().chat;
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toEqual(message);
    });

    it('maintains message order', () => {
      store.dispatch(addMessage({ id: '1', role: 'user', content: 'First' }));
      store.dispatch(
        addMessage({ id: '2', role: 'assistant', content: 'Second' }),
      );
      store.dispatch(addMessage({ id: '3', role: 'user', content: 'Third' }));

      const state = store.getState().chat;
      expect(state.messages.map((m) => m.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('updateMessage', () => {
    it('updates existing message content', () => {
      store.dispatch(
        addMessage({ id: '1', role: 'user', content: 'Original' }),
      );
      store.dispatch(updateMessage({ id: '1', content: 'Updated' }));

      const state = store.getState().chat;
      expect(state.messages[0].content).toBe('Updated');
    });

    it('ignores update for non-existent message', () => {
      store.dispatch(addMessage({ id: '1', role: 'user', content: 'Test' }));
      store.dispatch(updateMessage({ id: 'non-existent', content: 'Update' }));

      const state = store.getState().chat;
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].content).toBe('Test');
    });
  });

  describe('deleteMessage', () => {
    it('removes message by ID', () => {
      store.dispatch(addMessage({ id: '1', role: 'user', content: 'Keep' }));
      store.dispatch(addMessage({ id: '2', role: 'user', content: 'Delete' }));
      store.dispatch(deleteMessage('2'));

      const state = store.getState().chat;
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].id).toBe('1');
    });
  });

  describe('clearMessages', () => {
    it('removes all messages', () => {
      store.dispatch(
        addMessage({ id: '1', role: 'user', content: 'Message 1' }),
      );
      store.dispatch(
        addMessage({ id: '2', role: 'user', content: 'Message 2' }),
      );
      store.dispatch(clearMessages());

      const state = store.getState().chat;
      expect(state.messages).toHaveLength(0);
    });
  });

  describe('setLoading', () => {
    it('sets loading state', () => {
      store.dispatch(setLoading(true));
      expect(store.getState().chat.isLoading).toBe(true);

      store.dispatch(setLoading(false));
      expect(store.getState().chat.isLoading).toBe(false);
    });
  });

  describe('setError', () => {
    it('sets error message', () => {
      store.dispatch(setError('Something went wrong'));
      expect(store.getState().chat.error).toBe('Something went wrong');
    });

    it('clears error with null', () => {
      store.dispatch(setError('Error'));
      store.dispatch(setError(null));
      expect(store.getState().chat.error).toBeNull();
    });
  });

  describe('streaming actions', () => {
    it('manages streaming message lifecycle', () => {
      // Start streaming
      store.dispatch(setStreamingMessage({ id: 'stream-1', content: 'Hello' }));
      let state = store.getState().chat;
      expect(state.streamingMessage).toEqual({
        id: 'stream-1',
        content: 'Hello',
      });
      expect(state.isStreaming).toBe(true);

      // Update streaming content
      store.dispatch(
        setStreamingMessage({ id: 'stream-1', content: 'Hello world' }),
      );
      state = store.getState().chat;
      expect(state.streamingMessage?.content).toBe('Hello world');

      // Complete streaming
      store.dispatch(completeStreaming());
      state = store.getState().chat;
      expect(state.streamingMessage).toBeNull();
      expect(state.isStreaming).toBe(false);
    });
  });
});
