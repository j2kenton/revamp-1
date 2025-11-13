/**
 * SWR Library Exports
 *
 * Central export point for all SWR-related utilities, hooks, and types.
 * Import from this file to access SWR functionality throughout the app.
 */

// Fetcher functions
export { fetcher, fetcherWithAuth, fetcherPost } from './fetcher';

// Custom hooks
export {
  useUser,
  useCurrentUser,
  usePosts,
  usePost,
  useTodos,
  useCreateTodo,
  useUpdateTodo,
  useDeleteTodo,
  useSearch,
} from './hooks';

// Types
export type {
  ApiResponse,
  PaginatedResponse,
  User,
  Post,
  Todo,
  SwrConfig,
} from './types';
