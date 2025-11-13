# redux-persist Integration Guide

This project uses [redux-persist](https://github.com/rt2zz/redux-persist) to persist and rehydrate Redux state across browser sessions using localStorage.

## Overview

redux-persist automatically saves your Redux state to localStorage and restores it when the app loads. This is useful for:

- Maintaining user authentication across sessions
- Preserving user preferences and settings
- Keeping shopping cart data
- Saving form drafts
- Maintaining UI state (filters, pagination, etc.)

## Implementation

### Store Configuration (lib/redux/store.ts)

```typescript
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

// Configure which reducers to persist
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['counter', 'auth'], // Only persist these reducers
};

// Wrap root reducer with persistReducer
const persistedReducer = persistReducer(
  persistConfig,
  rootReducer,
) as unknown as typeof rootReducer;

// Create store with persisted reducer
export const store = initializeStore();
export const persistor = persistStore(store);
```

### Provider Setup (lib/redux/ReduxProvider.tsx)

```typescript
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from './store';

export function ReduxProvider({ children }: ReduxProviderProps) {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        {children}
      </PersistGate>
    </Provider>
  );
}
```

## Configuration Options

### Basic Configuration

```typescript
const persistConfig = {
  key: 'root',           // Key for localStorage
  storage,               // Storage engine (localStorage)
  whitelist: ['auth'],   // Reducers to persist
  blacklist: ['ui'],     // Reducers to NOT persist
};
```

### Whitelist vs Blacklist

**Whitelist (Recommended):**

```typescript
whitelist: ['counter', 'auth']
// Only 'counter' and 'auth' will be persisted
```

**Blacklist:**

```typescript
blacklist: ['temp', 'loading']
// Everything except 'temp' and 'loading' will be persisted
```

### Nested Persistence

For selective persistence within a reducer:

```typescript
import { persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

const authPersistConfig = {
  key: 'auth',
  storage,
  whitelist: ['user', 'token'], // Only persist these fields
};

export const authReducer = persistReducer(
  authPersistConfig,
  baseAuthReducer,
);
```

## Storage Engines

### localStorage (Default)

```typescript
import storage from 'redux-persist/lib/storage';
```

- **Limit:** ~5-10MB
- **Persistence:** Survives browser restarts
- **Scope:** Per origin (domain)

### sessionStorage

```typescript
import storageSession from 'redux-persist/lib/storage/session';

const persistConfig = {
  key: 'root',
  storage: storageSession, // Clears when tab closes
};
```

### Custom Storage

```typescript
const customStorage = {
  setItem: (key, value) => {
    // Custom save logic
    return Promise.resolve();
  },
  getItem: (key) => {
    // Custom load logic
    return Promise.resolve(null);
  },
  removeItem: (key) => {
    // Custom remove logic
    return Promise.resolve();
  },
};
```

## Usage Examples

### Basic Usage

State persists automatically. No special code needed in components:

```typescript
'use client';

import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { increment } from '@/lib/redux/features/counter/actions';

export function Counter() {
  const count = useAppSelector((state) => state.counter.count);
  const dispatch = useAppDispatch();

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => dispatch(increment())}>
        Increment
      </button>
    </div>
  );
}
```

The counter value will automatically persist across page refreshes!

### Checking Rehydration Status

```typescript
'use client';

import { useAppSelector } from '@/lib/redux/hooks';

export function MyComponent() {
  const isRehydrated = useAppSelector(
    (state) => state._persist?.rehydrated
  );

  if (!isRehydrated) {
    return <div>Loading...</div>;
  }

  return <div>App content</div>;
}
```

### Purging Persisted State

```typescript
import { persistor } from '@/lib/redux/store';

// Clear all persisted state
persistor.purge();

// Or clear localStorage directly
localStorage.clear();
```

## PersistGate

PersistGate delays rendering until state is rehydrated.

### With Loading Component

```typescript
<PersistGate loading={<LoadingSpinner />} persistor={persistor}>
  {children}
</PersistGate>
```

### With Callback

```typescript
<PersistGate
  persistor={persistor}
  onBeforeLift={() => {
    console.log('State rehydrated');
  }}
>
  {children}
</PersistGate>
```

### Without Delay

```typescript
<PersistGate loading={null} persistor={persistor}>
  {children}
</PersistGate>
```

## Advanced Features

### Transforms

Modify data before persisting or after rehydrating:

```typescript
import { createTransform } from 'redux-persist';

// Encrypt before saving
const encryptTransform = createTransform(
  // Transform state before persisting
  (inboundState, key) => {
    return encrypt(inboundState);
  },
  // Transform state after rehydrating
  (outboundState, key) => {
    return decrypt(outboundState);
  },
  { whitelist: ['auth'] }
);

const persistConfig = {
  key: 'root',
  storage,
  transforms: [encryptTransform],
};
```

### State Reconciler

Control how persisted state merges with initial state:

```typescript
import autoMergeLevel2 from 'redux-persist/lib/stateReconciler/autoMergeLevel2';

const persistConfig = {
  key: 'root',
  storage,
  stateReconciler: autoMergeLevel2, // Deep merge 2 levels
};
```

**Options:**

- `autoMergeLevel1` - Shallow merge (default)
- `autoMergeLevel2` - Deep merge 2 levels
- `hardSet` - Overwrite with persisted state
- Custom function

### Migration

Handle schema changes between versions:

```typescript
const migrations = {
  0: (state) => {
    // Migration for version 0
    return state;
  },
  1: (state) => {
    // Migration for version 1
    return {
      ...state,
      newField: 'default value',
    };
  },
};

const persistConfig = {
  key: 'root',
  storage,
  version: 1,
  migrate: createMigrate(migrations, { debug: true }),
};
```

## TypeScript Support

### Typed Persistor

```typescript
import { Persistor } from 'redux-persist';

export const persistor: Persistor = persistStore(store);
```

### Type-Safe Rehydration Check

```typescript
import { PersistPartial } from 'redux-persist/es/persistReducer';

type PersistedState = RootState & {
  _persist: PersistPartial;
};

const isRehydrated = (state: PersistedState) => 
  state._persist.rehydrated;
```

## Best Practices

### 1. Security

```typescript
// ❌ DON'T persist sensitive data
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['passwords'], // NEVER do this!
};

// ✅ DO only persist necessary, non-sensitive data
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['userPreferences', 'theme'],
};
```

### 2. Performance

```typescript
// ❌ DON'T persist large data
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['hugeDataArray'], // Can slow down app
};

// ✅ DO persist only essential data
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['auth', 'settings'],
  transforms: [compressTransform], // Compress if needed
};
```

### 3. Selective Persistence

```typescript
// ❌ DON'T persist everything
const persistConfig = {
  key: 'root',
  storage,
  // No whitelist = persists all reducers
};

// ✅ DO explicitly whitelist
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['counter', 'auth'],
};
```

### 4. Error Handling

```typescript
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['auth'],
  // Handle errors gracefully
  writeFailHandler: (err) => {
    console.error('Persist write error:', err);
  },
};
```

## Common Use Cases

### Persisting Authentication

```typescript
// lib/redux/features/auth/reducer.ts
const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
};

export const authReducer = (state = initialState, action: AuthAction) => {
  switch (action.type) {
    case 'AUTH_LOGIN':
      return {
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
      };
    case 'AUTH_LOGOUT':
      return initialState;
    default:
      return state;
  }
};

// Whitelist auth in persistConfig
const persistConfig = {
  whitelist: ['auth'],
};
```

### Persisting User Preferences

```typescript
const preferencesReducer = (state = initialState, action) => {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
    default:
      return state;
  }
};

// Persist preferences
const persistConfig = {
  whitelist: ['preferences'],
};
```

### Persisting Form Drafts

```typescript
const formReducer = (state = initialState, action) => {
  switch (action.type) {
    case 'UPDATE_DRAFT':
      return { ...state, draft: action.payload };
    case 'SUBMIT_FORM':
      return { ...state, draft: null };
    default:
      return state;
  }
};

// Persist drafts
const persistConfig = {
  whitelist: ['forms'],
};
```

## Debugging

### Inspect Persisted State

1. Open DevTools (F12)
2. Go to Application tab
3. Navigate to Storage → Local Storage
4. Find key: `persist:root`
5. View serialized JSON

### Clear Persisted State

```typescript
// Programmatically
import { persistor } from '@/lib/redux/store';

// Clear all
persistor.purge();

// Or clear specific keys
localStorage.removeItem('persist:root');

// Or clear everything
localStorage.clear();
window.location.reload();
```

### Debug Mode

```typescript
const persistConfig = {
  key: 'root',
  storage,
  debug: true, // Log persistence operations
};
```

## Troubleshooting

### State Not Persisting

**Problem:** Changes don't persist after refresh

**Solutions:**

1. Check whitelist includes the reducer:

   ```typescript
   whitelist: ['myReducer'] // Must match reducer key
   ```

2. Verify PersistGate is wrapping app:

   ```typescript
   <PersistGate loading={null} persistor={persistor}>
     <App />
   </PersistGate>
   ```

3. Check localStorage is available:

   ```typescript
   if (typeof window !== 'undefined' && window.localStorage) {
     // Use localStorage
   }
   ```

### TypeScript Errors

**Problem:** Type errors with persistReducer

**Solution:** Use type casting:

```typescript
const persistedReducer = persistReducer(
  persistConfig,
  rootReducer,
) as unknown as typeof rootReducer;
```

### State Not Rehydrating

**Problem:** Initial state used instead of persisted

**Solutions:**

1. Check PersistGate is used
2. Verify storage key matches:

   ```typescript
   localStorage.getItem('persist:root')
   ```

3. Check for migration issues
4. Clear old persisted state

### QuotaExceededError

**Problem:** localStorage limit exceeded

**Solutions:**

1. Reduce persisted data
2. Use compression transform
3. Use IndexedDB for larger data
4. Implement selective persistence

## Migration Guide

### From Redux without Persist

1. **Install redux-persist:**

   ```bash
   pnpm add redux-persist
   ```

2. **Update store:**

   ```typescript
   import { persistStore, persistReducer } from 'redux-persist';
   import storage from 'redux-persist/lib/storage';

   const persistConfig = {
     key: 'root',
     storage,
     whitelist: ['auth'],
   };

   const persistedReducer = persistReducer(persistConfig, rootReducer);
   export const store = createStore(persistedReducer);
   export const persistor = persistStore(store);
   ```

3. **Update provider:**

   ```typescript
   import { PersistGate } from 'redux-persist/integration/react';

   <Provider store={store}>
     <PersistGate loading={null} persistor={persistor}>
       <App />
     </PersistGate>
   </Provider>
   ```

## Resources

- [redux-persist Documentation](https://github.com/rt2zz/redux-persist)
- [Example Component](../../components/examples/ReduxPersistExample.tsx)
- [Redux Documentation](https://redux.js.org/)
- [localStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

## Example Component

See `components/examples/ReduxPersistExample.tsx` for a comprehensive example demonstrating:

- Counter with persistence
- Authentication state persistence
- How to verify persistence works
- Debugging tools
- Clear state functionality
