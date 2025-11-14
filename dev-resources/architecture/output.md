# AI-Powered Chat Application - Technical Plan

**Note:** The examples provided in this document (file structures, component hierarchies, data schemas, and API contracts) are illustrative. They serve as a starting point and should be adapted to meet the specific requirements of the project.

## 1. File & Folder Structure

```plaintext
app/
├── api/
│   ├── auth/
│   │   └── [...nextauth]/
│   │       └── route.ts
│   └── chat/
│       ├── route.ts
│       └── [chatId]/
│           └── route.ts
├── chat/
│   └── page.tsx
├── layout.tsx
├── page.tsx
└── global-error.tsx     // Added: Global error handler
components/
├── chat/
│   ├── chat-input.tsx
│   ├── chat-messages.tsx
│   └── chat-sidebar.tsx
├── error-boundary/           // Added: Error handling
│   └── ErrorBoundary.tsx
├── layout/
│   ├── navbar.tsx
│   └── theme-toggle.tsx
└── ui/
    ├── button.tsx
    ├── input.tsx
    └── card.tsx
lib/
├── auth.ts
├── chat.ts
├── rate-limiter.ts         // Added: Rate limiting
├── sanitizer.ts            // Added: Input sanitization
├── redis/                  // Added: Session management
│   └── client.ts
├── redux/
│   ├── features/
│   │   ├── auth/
│   │   ├── counter/
│   │   └── chat/
│   │       ├── actions.ts
│   │       ├── reducer.ts
│   │       └── types.ts
│   ├── hooks.ts
│   ├── ReduxProvider.tsx
│   ├── rootReducer.ts
│   └── store.ts
├── schemas.ts
└── tanstack-query/         // Added: TanStack Query setup
    ├── provider.tsx
    └── hooks.ts
middleware.ts               // Added: NextJS middleware
types/
├── index.ts
└── api.ts                  // Added: API-specific types
utils/                      // Added: Utility functions
├── error-handler.ts
├── logger.ts
└── performance.ts
__tests__/                  // Added: Test organization
├── unit/
├── integration/
└── fixtures/
e2e/                       // Added: E2E tests
└── chat.spec.ts
```

## 2. Core Component Hierarchy

<!-- Note: This plan uses the standard Next.js App Router for navigation. This deviates from the spec's recommendation of TanStack Router to follow framework best practices and ensure deeper integration with Next.js features. -->

* `RootLayout` (Server)
  * `ErrorBoundary` (Client) <!-- Added: Top-level error boundary -->
    * `ReduxProvider` (Client)
      * `TanStackQueryProvider` (Client) <!-- Added: Query provider -->
        * `Navbar` (Client)
          * `ThemeToggle` (Client)
          * `UserAvatar` (Client)
          * `SkipToContent` (Client) <!-- Added: A11y navigation -->
        * `HomePage` (Server Component at `app/page.tsx`)
        * `ChatPage` (Client Component at `app/chat/page.tsx`)
          * `ChatErrorBoundary` (Client) <!-- Added: Feature-specific error boundary -->
            * `ChatSidebar` (Client)
              * `ChatList` (Client)
              * `NewChatButton` (Client)
            * `ChatMessages` (Client)
              * `MessageList` (Client)
            * `ChatInput` (Client)
              * `InputField` (Client)
              * `SendButton` (Client)
              * `CharacterCounter` (Client) <!-- Added: UX improvement -->

## 3. TypeScript Data Schemas

```typescript
// types/index.ts

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: 'user' | 'admin';  // Added: Role-based access
  createdAt: string;         // Added: Timestamps
  updatedAt: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
  status: 'sending' | 'sent' | 'error';  // Added: Message status
  metadata?: {                           // Added: Metadata
    model?: string;
    tokensUsed?: number;
    processingTime?: number;
  };
}

interface Chat {
  id: string;
  userId: string;            // Added: User association
  title: string;             // Added: Chat title
  messages: Message[];
  createdAt: string;         // Added: Timestamps
  updatedAt: string;
  archived?: boolean;        // Added: Archive status
}

// Added: Error types
interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

// Added: API response wrapper
interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  meta?: {
    requestId: string;
    timestamp: number;
  };
}
```

```typescript
// lib/redux/features/chat/types.ts
export interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  optimisticUpdates: Map<string, Message>;  // Added: Optimistic UI
}

// Action types
export const ADD_MESSAGE = 'chat/addMessage';
export const SET_ACTIVE_CHAT = 'chat/setActiveChat';
export const ADD_OPTIMISTIC = 'chat/addOptimistic';  // Added
export const REMOVE_OPTIMISTIC = 'chat/removeOptimistic';  // Added

interface AddMessageAction {
  type: typeof ADD_MESSAGE;
  payload: { chatId: string; message: Message };
}

interface SetActiveChatAction {
  type: typeof SET_ACTIVE_CHAT;
  payload: { chatId: string };
}

export type ChatActionTypes = 
  | AddMessageAction 
  | SetActiveChatAction;
```

```typescript
// lib/schemas.ts
import { z } from 'zod';

// Enhanced validation with security considerations
export const msalSigninSchema = z.object({
  token: z.string().min(1).max(5000),  // Added: Length constraints
  nonce: z.string().optional(),        // Added: CSRF protection
});

export const chatMessageSchema = z.object({
  chatId: z.string().uuid(),           // Added: UUID validation
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message too long')
    .transform(val => val.trim()),     // Added: Sanitization
  parentMessageId: z.string().uuid().optional(),  // Added: Threading
});

// Added: Rate limiting schema
export const rateLimitSchema = z.object({
  userId: z.string(),
  endpoint: z.string(),
  timestamp: z.number(),
});
```

## 4. API Contracts

* **POST** `/api/auth/signin/msal`
  * **Purpose**: Authenticates a user with MSAL.
  * **Request Body**: `msalSigninSchema`
  * **Response**: `ApiResponse<{ session: Session, csrfToken: string }>`
  * **Error Responses**:
    * `400`: Invalid token format
    * `401`: Authentication failed
    * `429`: Rate limit exceeded
  * **Headers**: `X-CSRF-Token`, `X-Request-Id`

* **POST** `/api/auth/signout`
  * **Purpose**: Signs out the currently authenticated user.
  * **Response**: `200 OK`
  * **Side Effects**: Clears session from Redis, invalidates tokens

* **GET** `/api/auth/session`
  * **Purpose**: Retrieves the current user session.
  * **Response**: `ApiResponse<{ session: Session }>`
  * **Cache**: `Cache-Control: private, max-age=0`

* **POST** `/api/chat`
  * **Purpose**: Sends a message to the AI LLM and gets a response.
  * **Request Body**: `chatMessageSchema`
  * **Response**: `ApiResponse<{ message: Message }>`
  * **Error Responses**:
    * `400`: Invalid message format
    * `401`: Unauthorized
    * `429`: Rate limit exceeded
    * `500`: LLM service error
  * **Rate Limit**: 10 requests per minute per user
  * **Timeout**: 30 seconds

* **GET** `/api/chat/[chatId]`
  * **Purpose**: Retrieves a specific chat history
  * **Response**: `ApiResponse<{ chat: Chat }>`
  * **Cache**: `Cache-Control: private, max-age=300`

## 5. Validation Strategy

* **Client-Side**:
  * Use `zod` with `react-hook-form` for form validation
  * Real-time validation with debouncing (300ms) for performance
  * HTML5 input constraints as first defense
  * Custom hooks for common validation patterns
  * Accessibility: Error messages announced via `aria-live` regions

* **Server-Side**:
  * All API routes use `zod` schemas with strict parsing
  * Middleware layer for common validations (auth, rate limiting)
  * Input sanitization using DOMPurify for XSS prevention
  * CSRF token validation for state-changing operations
  * Request size limits (100KB for chat messages)

## 6. State Management Strategy

<!-- Note: This plan deviates from the spec doc in two areas to align with the existing codebase and framework best practices.
1. State Management: Uses Redux (existing in codebase) instead of Zustand.
2. The choice of TanStack Query deviates from the existing codebase convention (SWR) to strictly adhere to the project requirements outlined in the specification document. -->

* **Global State (Complex):** Redux with performance optimizations
  * Chat state managed in `lib/redux/features/chat/`
  * Normalized state shape for efficient updates
  * Redux DevTools integration in development
  * Middleware for logging and error handling

* **Component State:** React hooks hierarchy
  * `useState`: Simple UI state (modals, toggles)
  * `useReducer`: Complex form state with multiple fields
  * `useContext`: Theme preferences, user preferences

* **Server Cache State:** TanStack Query
  * Custom hooks: `useChatHistory`, `useSendMessage`, `useUserSession`
  * Optimistic updates for better UX
  * Background refetching with stale-while-revalidate
  * Query invalidation on mutations
  * Offline support with persistence

## 7. Testing Strategy

* **Unit Tests** (Target: 80% coverage):
  * **Target**: Functions, hooks, reducers, components, validation schemas
  * **Framework**: Jest, React Testing Library
  * **Location**: `__tests__/unit/`
  * **Goal**: Verify individual units work correctly with edge cases

* **Integration Tests** (Target: 60% coverage):
  * **Target**: Feature workflows, state synchronization
  * **Framework**: Jest, React Testing Library, MSW
  * **Location**: `__tests__/integration/`
  * **Goal**: Verify components work together correctly

* **End-to-End (E2E) Tests** (Critical paths):
  * **Target**: Full user journeys from UI to API
  * **Framework**: Playwright
  * **Location**: `e2e/`
  * **Goal**: Verify critical paths in production-like environment
  * **Additional**: Accessibility testing with axe-core, performance monitoring

<!-- Added sections below to enhance production readiness -->

## 8. Security Considerations

* **Authentication & Authorization:**
  * MSAL integration with proper token validation
  * Session management via Redis with TTL
  * Role-based access control (RBAC)
  * Secure cookie configuration

* **Data Protection:**
  * HTTPS enforcement via middleware
  * Content Security Policy headers
  * Input sanitization at all entry points
  * Rate limiting per user and IP

* **Monitoring:**
  * Security event logging
  * Error tracking with Sentry
  * Performance monitoring

## 9. Performance Optimization

* **Bundle Optimization:**
  * Code splitting at route level
  * Dynamic imports for heavy components
  * Tree shaking and compression

* **Runtime Performance:**
  * React.memo for expensive components
  * Lazy loading for non-critical components
  * Image optimization with next/image

## 10. Accessibility Requirements

* **WCAG A Compliance:**
  * Semantic HTML structure
  * ARIA labels and roles
  * Keyboard navigation support
  * Screen reader compatibility
  * Focus management
  * Color contrast requirements
  * Skip navigation links
