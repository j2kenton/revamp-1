# SWR Quick Reference

## 🚀 Quick Start

### 1. Install

```bash
pnpm add swr
```

### 2. Import and Use

```tsx
'use client';

import { useUser } from '@/lib/swr/hooks';

export function MyComponent() {
  const { data, error, isLoading } = useUser('123');
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error!</div>;
  
  return <div>{data.name}</div>;
}
```

---

## 📖 Available Hooks

| Hook | Purpose | Example |
|------|---------|---------|
| `useUser(userId)` | Fetch single user | `useUser('1')` |
| `useCurrentUser(token)` | Fetch authenticated user | `useCurrentUser(token)` |
| `usePosts(page, size)` | Fetch paginated posts | `usePosts(1, 10)` |
| `usePost(postId)` | Fetch single post | `usePost('abc')` |
| `useTodos(userId)` | Fetch user's todos | `useTodos('1')` |
| `useCreateTodo()` | Create new todo | Mutation hook |
| `useUpdateTodo(id)` | Update todo | Mutation hook |
| `useDeleteTodo(id)` | Delete todo | Mutation hook |
| `useSearch(endpoint, term)` | Debounced search | `useSearch('/api', query)` |

---

## 🎯 Common Patterns

### Basic Fetch

```tsx
const { data, error, isLoading } = useUser(userId);
```

### Conditional Fetch

```tsx
// Only fetch if userId exists
const { data } = useUser(userId || null);
```

### Manual Revalidation

```tsx
const { data, mutate } = useUser(userId);

// Trigger refresh
mutate();
```

### Mutations

```tsx
const { trigger, isMutating } = useCreateTodo();

await trigger({ title: 'New todo', userId: '1' });
```

### With Auth

```tsx
const { data } = useCurrentUser(session?.token || null);
```

---

## 🎨 Return Values

### Query Hooks

```typescript
{
  data: T | undefined;           // Response data
  error: Error | undefined;      // Error object
  isLoading: boolean;            // Initial load
  isValidating: boolean;         // Background revalidation
  mutate: () => Promise<void>;   // Manual revalidation
}
```

### Mutation Hooks

```typescript
{
  trigger: (arg) => Promise<T>;  // Execute mutation
  isMutating: boolean;           // Mutation in progress
  error: Error | undefined;      // Mutation error
  reset: () => void;             // Reset mutation state
}
```

---

## ⚙️ Configuration

### Per-Hook Config

```tsx
useUser(userId, {
  revalidateOnFocus: false,
  refreshInterval: 30000,
  dedupingInterval: 2000,
});
```

### Global Config

```tsx
<SWRConfig value={{ revalidateOnFocus: false }}>
  <App />
</SWRConfig>
```

---

## 🔥 Pro Tips

1. **Always handle states:**
   - Loading: `isLoading`
   - Error: `error`
   - No data: `!data`

2. **Use null for conditional fetching:**

   ```tsx
   useSWR(condition ? '/api/data' : null, fetcher)
   ```

3. **Revalidate after mutations:**

   ```tsx
   await createTodo(newTodo);
   await mutate(); // Refresh list
   ```

4. **Debounce search queries:**

   ```tsx
   useSearch(endpoint, searchTerm, 500) // 500ms delay
   ```

5. **TypeScript types:**

   ```tsx
   const { data } = useSWR<User>('/api/user', fetcher);
   ```

---

## 📁 File Locations

- **Hooks:** `lib/swr/hooks.ts`
- **Types:** `lib/swr/types.ts`
- **Fetchers:** `lib/swr/fetcher.ts`
- **Examples:** `components/examples/`
- **Demo Page:** `app/swr-demo/page.tsx`

---

## 🐛 Troubleshooting

### Data not updating?

```tsx
// Force revalidation
mutate();
```

### Infinite loops?

```tsx
// Use dependency array correctly
useSWR(
  userId ? `/api/users/${userId}` : null,
  fetcher
);
```

### TypeScript errors?

```tsx
// Specify types explicitly
useSWR<User, Error>('/api/user', fetcher);
```

---

## 📚 More Info

- Full docs: `lib/swr/README.md`
- Live demo: `/swr-demo`
- Official SWR docs: <https://swr.vercel.app>
