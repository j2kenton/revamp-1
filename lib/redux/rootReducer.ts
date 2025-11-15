import { combineReducers } from 'redux';
import { counterReducer } from './features/counter/reducer';
import { authReducer } from './features/auth/reducer';
import { chatReducer } from './features/chat/reducer';

// Combine all feature reducers
export const rootReducer = combineReducers({
  counter: counterReducer,
  auth: authReducer,
  chat: chatReducer,
});

// Export the root state type
export type RootState = ReturnType<typeof rootReducer>;
