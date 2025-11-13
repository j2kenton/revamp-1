/**
 * SWR Type Definitions
 *
 * Common types used across SWR hooks and components
 */

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

/**
 * Paginated response type
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * User data type (example)
 */
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: string;
  updatedAt: string;
}

/**
 * Post data type (example)
 */
export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  author?: User;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

/**
 * Todo item type (example)
 */
export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  userId: string;
  createdAt: string;
}

/**
 * SWR configuration options
 */
export interface SwrConfig {
  revalidateOnFocus?: boolean;
  revalidateOnReconnect?: boolean;
  refreshInterval?: number;
  dedupingInterval?: number;
}
