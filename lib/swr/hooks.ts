/**
 * Custom SWR Hooks
 *
 * Reusable hooks for common data fetching patterns using SWR
 */

import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr';
import useSWRMutation, { type SWRMutationResponse } from 'swr/mutation';

import { fetcher, fetcherWithAuth, fetcherPost } from './fetcher';
import type { User, Post, Todo, PaginatedResponse } from './types';

/**
 * Hook to fetch a single user by ID
 * @param userId - The user ID to fetch
 * @param config - Optional SWR configuration
 * @returns SWR response with user data
 */
export function useUser(
  userId: string | null,
  config?: SWRConfiguration,
): SWRResponse<User, Error> {
  return useSWR<User, Error>(userId ? `/api/users/${userId}` : null, fetcher, {
    revalidateOnFocus: false,
    ...config,
  });
}

/**
 * Hook to fetch current authenticated user
 * @param token - Authentication token
 * @param config - Optional SWR configuration
 * @returns SWR response with user data
 */
export function useCurrentUser(
  token: string | null,
  config?: SWRConfiguration,
): SWRResponse<User, Error> {
  return useSWR<User, Error>(
    token ? ['/api/users/me', token] : null,
    ([url, tokenArg]: [string, string]) => fetcherWithAuth<User>(url, tokenArg),
    {
      revalidateOnFocus: false,
      ...config,
    },
  );
}

/**
 * Hook to fetch a list of posts
 * @param page - Page number for pagination
 * @param pageSize - Number of items per page
 * @param config - Optional SWR configuration
 * @returns SWR response with paginated posts
 */
export function usePosts(
  page = 1,
  pageSize = 10,
  config?: SWRConfiguration,
): SWRResponse<PaginatedResponse<Post>, Error> {
  return useSWR<PaginatedResponse<Post>, Error>(
    `/api/posts?page=${page}&pageSize=${pageSize}`,
    fetcher,
    {
      revalidateOnFocus: false,
      ...config,
    },
  );
}

/**
 * Hook to fetch a single post by ID
 * @param postId - The post ID to fetch
 * @param config - Optional SWR configuration
 * @returns SWR response with post data
 */
export function usePost(
  postId: string | null,
  config?: SWRConfiguration,
): SWRResponse<Post, Error> {
  return useSWR<Post, Error>(postId ? `/api/posts/${postId}` : null, fetcher, {
    revalidateOnFocus: false,
    ...config,
  });
}

/**
 * Hook to fetch todos for a user
 * @param userId - The user ID
 * @param config - Optional SWR configuration
 * @returns SWR response with todos array
 */
export function useTodos(
  userId: string | null,
  config?: SWRConfiguration,
): SWRResponse<Todo[], Error> {
  return useSWR<Todo[], Error>(
    userId ? `/api/users/${userId}/todos` : null,
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      ...config,
    },
  );
}

/**
 * Hook to create a new todo item
 * @returns SWR mutation response
 */
export function useCreateTodo(): SWRMutationResponse<
  Todo,
  Error,
  string,
  Omit<Todo, 'id' | 'createdAt'>
> {
  return useSWRMutation(
    '/api/todos',
    async (url, { arg }: { arg: Omit<Todo, 'id' | 'createdAt'> }) =>
      fetcherPost<Todo, typeof arg>(url, arg),
  );
}

/**
 * Hook to update a todo item
 * @param todoId - The todo ID to update
 * @returns SWR mutation response
 */
export function useUpdateTodo(
  todoId: string,
): SWRMutationResponse<Todo, Error, string, Partial<Todo>> {
  return useSWRMutation(
    `/api/todos/${todoId}`,
    async (url, { arg }: { arg: Partial<Todo> }) => {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(arg),
      });

      if (!response.ok) {
        throw new Error('Failed to update todo');
      }

      return response.json();
    },
  );
}

/**
 * Hook to delete a todo item
 * @param todoId - The todo ID to delete
 * @returns SWR mutation response
 */
export function useDeleteTodo(
  todoId: string,
): SWRMutationResponse<void, Error, string, void> {
  return useSWRMutation(`/api/todos/${todoId}`, async (url) => {
    const response = await fetch(url, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete todo');
    }
  });
}

/**
 * Hook for searching/filtering data with debounce
 * @param endpoint - API endpoint
 * @param searchTerm - Search query
 * @param debounceMs - Debounce delay in milliseconds
 * @param config - Optional SWR configuration
 * @returns SWR response with search results
 */
export function useSearch<T>(
  endpoint: string,
  searchTerm: string,
  debounceMs = 300,
  config?: SWRConfiguration,
): SWRResponse<T[], Error> {
  // Only make request if search term has content
  const key =
    searchTerm.trim().length > 0
      ? `${endpoint}?q=${encodeURIComponent(searchTerm)}`
      : null;

  return useSWR<T[], Error>(key, fetcher, {
    dedupingInterval: debounceMs,
    revalidateOnFocus: false,
    ...config,
  });
}
