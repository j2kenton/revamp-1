# SWR Implementation Examples

This directory contains comprehensive examples of using **SWR** (stale-while-revalidate) for data fetching in Next.js applications.

## 📁 Structure

```plaintext
lib/swr/
├── fetcher.ts        # Generic fetcher functions with error handling
├── types.ts          # TypeScript type definitions
├── hooks.ts          # Custom SWR hooks for common patterns
└── README.md         # This file

components/examples/
├── UserProfile.tsx   # Single resource fetching example
├── PostsList.tsx     # Pagination example
├── TodoList.tsx      # CRUD operations with mutations
└── SearchPosts.tsx   # Real-time search with debouncing

app/api/
├── users/[userId]/   # Mock user API
└── todos/            # Mock todos API with CRUD
```

---

## 🎯 Core Concepts

### What is SWR?

SWR is a React Hooks library for data fetching that provides:

- **Fast, lightweight, and reusable** data fetching
- **Built-in cache** and request deduplication
- **Real-time** experience with optimistic UI updates
- **Transport and protocol agnostic** (REST, GraphQL, etc.)
- **Pagination and infinite loading** support
- **TypeScript ready**

### Key Features Demonstrated

1. **Basic Data Fetching** - Simple GET requests
2. **Loading States** - Proper skeleton/loading UI
3. **Error Handling** - User-friendly error messages
4. **Revalidation** - Manual and automatic data refresh
5. **Pagination** - Page-based navigation
6. **Mutations** - Create, update, delete operations
7. **Optimistic Updates** - Instant UI feedback
8. **Search/Filtering** - Debounced search queries
9. **Authentication** - Token-based API requests

---

## 🔧 Implementation Guide

### 1. Basic Setup

Install SWR:

```bash
pnpm add swr
```

### 2. Fetcher Functions (`lib/swr/fetcher.ts`)

The fetcher is a function that accepts a URL and returns data:

```typescript
export async function fetcher<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url);
  
  if (!response.ok) {
    const error: FetchError = new Error('An error occurred while fetching the data.');
    error.info = await response.json();
    error.status = response.status;
    throw error;
  }
  
  return response.json();
}
```

**Key Points:**

- ✅ Generic type support for TypeScript
- ✅ Proper error handling with status codes
- ✅ Throws errors for non-OK responses (SWR catches these)

### 3. Custom Hooks (`lib/swr/hooks.ts`)

Encapsulate common data fetching patterns:

```typescript
export function useUser(userId: string | null) {
  return useSWR<User, Error>(
    userId ? `/api/users/${userId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );
}
```

**Key Points:**

- ✅ Conditional fetching (null key = no fetch)
- ✅ Type-safe responses
- ✅ Configurable options

---

## 📚 Usage Examples

### Example 1: Fetching a Single Resource

**Use Case:** Display user profile data

```tsx
'use client';

import { useUser } from '@/lib/swr/hooks';

export function UserProfile({ userId }: { userId: string }) {
  const { data: user, error, isLoading } = useUser(userId);

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorMessage error={error} />;
  if (!user) return <NotFound />;

  return <div>{user.name}</div>;
}
```

**Features:**

- ✅ Automatic caching
- ✅ Background revalidation
- ✅ Proper loading and error states

**See:** `components/examples/UserProfile.tsx`

---

### Example 2: Pagination

**Use Case:** Paginated list of blog posts

```tsx
export function PostsList() {
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = usePosts(page, 10);

  return (
    <>
      {data.data.map(post => <PostCard key={post.id} post={post} />)}
      <Pagination 
        page={page} 
        totalPages={data.totalPages}
        onPageChange={setPage}
      />
    </>
  );
}
```

**Features:**

- ✅ Efficient page navigation
- ✅ Cached previous pages
- ✅ Automatic deduplication

**See:** `components/examples/PostsList.tsx`

---

### Example 3: Mutations (Create, Update, Delete)

**Use Case:** Todo list with CRUD operations

```tsx
import { useTodos, useCreateTodo } from '@/lib/swr/hooks';

export function TodoList({ userId }: { userId: string }) {
  const { data: todos, mutate } = useTodos(userId);
  const { trigger: createTodo } = useCreateTodo();

  const handleCreate = async (title: string) => {
    await createTodo({ title, completed: false, userId });
    await mutate(); // Revalidate todos list
  };

  return (
    <>
      <CreateForm onSubmit={handleCreate} />
      <TodoItems todos={todos} />
    </>
  );
}
```

**Features:**

- ✅ Optimistic updates possible
- ✅ Manual revalidation after mutations
- ✅ Error handling for failed mutations

**See:** `components/examples/TodoList.tsx`

---

### Example 4: Real-time Search

**Use Case:** Search blog posts as user types

```tsx
export function SearchPosts() {
  const [searchTerm, setSearchTerm] = useState('');
  
  const { data: results } = useSearch<Post>(
    '/api/posts/search',
    searchTerm,
    500 // 500ms debounce
  );

  return (
    <>
      <input onChange={(e) => setSearchTerm(e.target.value)} />
      <ResultsList results={results} />
    </>
  );
}
```

**Features:**

- ✅ Debounced API calls
- ✅ Automatic request cancellation
- ✅ Conditional fetching (empty search = no request)

**See:** `components/examples/SearchPosts.tsx`

---

### Example 5: Authenticated Requests

**Use Case:** Fetch current user with auth token

```tsx
export function CurrentUserBadge({ token }: { token: string }) {
  const { data: user } = useCurrentUser(token);

  return <div>{user?.name}</div>;
}
```

**Custom Hook:**

```typescript
export function useCurrentUser(token: string | null) {
  return useSWR<User, Error>(
    token ? ['/api/users/me', token] : null,
    ([url, token]) => fetcherWithAuth<User>(url, token)
  );
}
```

**Features:**

- ✅ Token passed to fetcher via array key
- ✅ Automatic revalidation on token change
- ✅ Conditional fetching when no token

---

## ⚙️ Configuration Options

### Global Configuration

Wrap your app with `SWRConfig` to set global options:

```tsx
import { SWRConfig } from 'swr';

export default function App({ children }) {
  return (
    <SWRConfig 
      value={{
        fetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 2000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
```

### Common Options

| Option | Description | Default |
|--------|-------------|---------|
| `revalidateOnFocus` | Revalidate when window regains focus | `true` |
| `revalidateOnReconnect` | Revalidate when network reconnects | `true` |
| `refreshInterval` | Auto-revalidate interval (ms) | `0` (disabled) |
| `dedupingInterval` | Dedupe requests within interval (ms) | `2000` |
| `errorRetryCount` | Max retry attempts on error | `5` |

---

## 🎨 Best Practices

### 1. **Always Handle Loading and Error States**

```tsx
if (isLoading) return <Skeleton />;
if (error) return <ErrorMessage />;
if (!data) return <Empty />;
```

### 2. **Use Conditional Fetching**

```tsx
// ✅ Good: Only fetch when userId exists
useSWR(userId ? `/api/users/${userId}` : null, fetcher);

// ❌ Bad: Always tries to fetch
useSWR(`/api/users/${userId}`, fetcher);
```

### 3. **Proper Key Management**

```tsx
// Simple key
useSWR('/api/users', fetcher);

// Dynamic key with params
useSWR(`/api/posts?page=${page}`, fetcher);

// Array key for complex args
useSWR(['/api/users/me', token], ([url, token]) => fetcherWithAuth(url, token));
```

### 4. **Optimistic Updates**

```tsx
const { data, mutate } = useSWR('/api/todos');

async function updateTodo(id, newData) {
  // Optimistically update local data
  mutate(
    todos.map(todo => todo.id === id ? { ...todo, ...newData } : todo),
    false // Don't revalidate yet
  );
  
  // Send request to API
  await fetch(`/api/todos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(newData),
  });
  
  // Revalidate to ensure sync
  mutate();
}
```

### 5. **Error Boundaries**

Wrap components using SWR in error boundaries for graceful error handling:

```tsx
<ErrorBoundary fallback={<ErrorFallback />}>
  <DataFetchingComponent />
</ErrorBoundary>
```

---

## 🔍 Testing

### Testing Components with SWR

Use `SWRConfig` to provide mock data in tests:

```tsx
import { SWRConfig } from 'swr';
import { render, screen } from '@testing-library/react';

test('renders user profile', () => {
  const mockUser = { id: '1', name: 'John Doe' };
  
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <UserProfile userId="1" />
    </SWRConfig>
  );
  
  // Test loading state, then mock response
});
```

---

## 📖 Additional Resources

- **Official SWR Docs:** <https://swr.vercel.app>
- **Next.js Data Fetching:** <https://nextjs.org/docs/app/building-your-application/data-fetching>
- **SWR Examples:** <https://swr.vercel.app/examples>

---

## 🚨 Security Checklist

Before using in production:

- ☐ **Sanitize all user inputs** before sending to API
- ☐ **Validate API responses** before displaying
- ☐ **Use HTTPS** for all API endpoints
- ☐ **Implement rate limiting** on API routes
- ☐ **Never expose sensitive data** in client-side code
- ☐ **Use proper authentication** for protected routes
- ☐ **Handle errors gracefully** without exposing system details

---

## 🎓 Learning Path

1. **Start with:** `UserProfile.tsx` - Basic data fetching
2. **Then try:** `PostsList.tsx` - Pagination
3. **Move to:** `TodoList.tsx` - Mutations
4. **Advanced:** `SearchPosts.tsx` - Real-time search

---

## 💡 Common Patterns

### Pattern: Dependent Queries

```tsx
function UserPosts({ userId }: { userId: string }) {
  const { data: user } = useUser(userId);
  const { data: posts } = usePosts(user?.id); // Only fetches when user exists
  
  return <PostsList posts={posts} />;
}
```

### Pattern: Infinite Loading

```tsx
import useSWRInfinite from 'swr/infinite';

function InfinitePosts() {
  const { data, size, setSize } = useSWRInfinite(
    (index) => `/api/posts?page=${index + 1}`,
    fetcher
  );
  
  return (
    <>
      {data?.map(page => page.data.map(post => <Post key={post.id} {...post} />))}
      <button onClick={() => setSize(size + 1)}>Load More</button>
    </>
  );
}
```

### Pattern: Prefetching

```tsx
import { mutate } from 'swr';

function PrefetchOnHover() {
  return (
    <Link
      href="/user/1"
      onMouseEnter={() => mutate('/api/users/1')}
    >
      User Profile
    </Link>
  );
}
```

---

**Last Updated:** November 2025
