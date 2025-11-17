'use client';

// 1. React/Next
import { type ReactNode } from 'react';

// 2. Third-party
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';

// 4. ./ relative
import { store, persistor } from './store';

interface ReduxProviderProps {
  children: ReactNode;
}

/**
 * ReduxProvider with redux-persist integration
 * Wraps the app with Redux Provider and PersistGate for state persistence
 */
export function ReduxProvider({ children }: ReduxProviderProps) {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        {children}
      </PersistGate>
    </Provider>
  );
}
