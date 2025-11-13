import { combineReducers } from 'redux';
import { counterReducer } from './features/counter/reducer';
import { authReducer } from './features/auth/reducer';

// Combine all feature reducers
export const rootReducer = combineReducers({
  counter: counterReducer,
  auth: authReducer,
});

// Export the root state type
export type RootState = ReturnType<typeof rootReducer>;
