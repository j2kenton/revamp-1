// 😁 Excuse the naming here. I admit that my point may be just a tiny bit subjective but I have Josh Comeau on my side so there! 🤪
import {
  legacy_createStore as classicTimelessOriginalAndStillTheBestPatternCreateStore,
  StoreEnhancer,
  Reducer,
  AnyAction,
} from 'redux';
import { persistStore, persistReducer, Persistor } from 'redux-persist';
import storage from 'redux-persist/lib/storage'; // defaults to localStorage for web
import { rootReducer, RootState } from './rootReducer';

// Extend Window interface for Redux DevTools
declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: () => StoreEnhancer;
  }
}

// Redux Persist configuration
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['counter', 'auth'], // Specify which reducers to persist
  // blacklist: [], // Specify which reducers NOT to persist
};

/**
 * Wrap the root reducer with persistReducer.
 * The double type assertion (through 'unknown') is necessary due to redux-persist's
 * type inference limitations with combineReducers. This is a known issue
 * in the redux-persist library (see: https://github.com/rt2zz/redux-persist/issues/1140)
 * The assertion is safe as persistReducer preserves the state shape at runtime.
 */
const persistedReducer = persistReducer(
  persistConfig,
  rootReducer as unknown as Reducer<RootState, AnyAction>,
) as unknown as Reducer<RootState, AnyAction>;

// Create the Redux store with DevTools support (development only)
const enhancer =
  process.env.NODE_ENV === 'development' &&
  typeof window !== 'undefined' &&
  window.__REDUX_DEVTOOLS_EXTENSION__
    ? window.__REDUX_DEVTOOLS_EXTENSION__()
    : undefined;

// Store factory function for SSR compatibility.
// See comment on first line of this file 😏
export const initializeStore = () =>
  classicTimelessOriginalAndStillTheBestPatternCreateStore(
    persistedReducer,
    undefined,
    enhancer,
  );

// Create and export the store instance
export const store = initializeStore();

// Create and export the persistor
export const persistor: Persistor = persistStore(store);

// Export types for TypeScript
export type AppDispatch = typeof store.dispatch;
export type { RootState };
