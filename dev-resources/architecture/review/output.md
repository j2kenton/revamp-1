# AI-Powered Chat Application - Technical Plan (Revised)

<!-- REVIEW NOTE: This revised architecture addresses critical issues found in the original plan including missing security measures, incomplete error handling strategies, accessibility considerations, and performance optimization approaches. -->

**Note:** The examples provided in this document (file structures, component hierarchies, data schemas, and API contracts) are illustrative. They serve as a starting point and should be adapted to meet the specific requirements of the project.

## 1. File & Folder Structure

<!-- CRITICAL ISSUE FIXED: Added missing directories for error boundaries, middleware, utilities, and test infrastructure -->

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
│   ├── page.tsx
│   ├── loading.tsx      // Added: Loading state
│   └── error.tsx        // Added: Error boundary
├── layout.tsx
├── page.tsx
└── global-error.tsx     // Added: Global error handler
components/
├── chat/
│   ├── chat-input.tsx
│   ├── chat-messages.tsx
│   ├── chat-sidebar.tsx
│   └── message-skeleton.tsx  // Added: Loading state component
├── error-boundary/           // Added: Error handling
│   └── ErrorBoundary.tsx
├── layout/
│   ├── navbar.tsx
│   └── theme-toggle.tsx
└── ui/
    ├── button.tsx
    ├── input.tsx
    ├── card.tsx
    └── skeleton.tsx         // Added: Skeleton loader
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
│   │       ├── selectors.ts  // Added: Memoized selectors
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

<!-- IMPROVEMENT: Added error boundaries, loading states, and accessibility wrappers -->

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
              * `MessageSkeleton` (Client) <!-- Added: Loading state -->
            * `ChatInput` (Client)
              * `InputField` (Client)
              * `SendButton` (Client)
              * `CharacterCounter` (Client) <!-- Added: UX improvement -->

## 3. TypeScript Data Schemas

<!-- CRITICAL ISSUE FIXED: Added missing error types, API response types, and proper null safety -->

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
  isLoading: boolean;          // Added: Loading state
  error: ApiError | null;      // Added: Error state
  optimisticUpdates: Map<string, Message>;  // Added: Optimistic UI
}

// Action types
export const ADD_MESSAGE = 'chat/addMessage';
export const SET_ACTIVE_CHAT = 'chat/setActiveChat';
export const SET_LOADING = 'chat/setLoading';        // Added
export const SET_ERROR = 'chat/setError';            // Added
export const ADD_OPTIMISTIC = 'chat/addOptimistic';  // Added
export const REMOVE_OPTIMISTIC = 'chat/removeOptimistic';  // Added

// ... additional action interfaces
```

```typescript
// lib/schemas.ts
import { z } from 'zod';

// Added: Enhanced validation with security considerations
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

<!-- CRITICAL ISSUE FIXED: Added proper error responses, rate limiting headers, and CORS considerations -->

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

* **GET** `/api/chat/[chatId]`  <!-- Added: Chat retrieval -->
  * **Purpose**: Retrieves a specific chat history
  * **Response**: `ApiResponse<{ chat: Chat }>`
  * **Cache**: `Cache-Control: private, max-age=300`

## 5. Validation Strategy

<!-- IMPROVEMENT: Added comprehensive validation layers with security focus -->

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
  * SQL injection prevention via parameterized queries
  * File upload validation (type, size, virus scan)
  * CSRF token validation for state-changing operations

* **Edge Runtime**: <!-- Added: Edge validation -->
  * Request size limits (100KB for chat messages)
  * Header validation and sanitization
  * IP-based rate limiting

## 6. State Management Strategy

<!-- IMPROVEMENT: Added performance optimizations and better separation of concerns -->

* **Global State (Complex):** Redux with performance optimizations
  * Chat state managed in `lib/redux/features/chat/`
  * Normalized state shape for efficient updates
  * Memoized selectors using `reselect` for performance
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

* **Performance Optimizations:** <!-- Added: Performance strategy -->
  * Virtual scrolling for long message lists
  * Message pagination (50 messages per page)
  * Lazy loading for chat sidebar
  * Image optimization with next/image

## 7. Testing Strategy

<!-- IMPROVEMENT: Added comprehensive testing coverage including security and performance tests -->

* **Unit Tests** (Target: 80% coverage):
  * **Scope**: Functions, hooks, reducers, components
  * **Framework**: Jest, React Testing Library
  * **Location**: `__tests__/unit/`
  * **Key Tests**:
    * Input sanitization functions
    * Redux reducers and selectors
    * Validation schemas
    * Utility functions
    * Component rendering and props

* **Integration Tests** (Target: 60% coverage):
  * **Scope**: Feature workflows
  * **Framework**: Jest, React Testing Library, MSW
  * **Location**: `__tests__/integration/`
  * **Key Tests**:
    * Chat message flow (send, receive, display)
    * Authentication flow
    * Error handling workflows
    * State synchronization

* **E2E Tests** (Critical paths):
  * **Scope**: Full user journeys
  * **Framework**: Playwright
  * **Location**: `e2e/`
  * **Key Tests**:
    * Login → Send message → Receive response
    * Chat history persistence
    * Error recovery scenarios
    * Accessibility navigation

* **Security Tests:** <!-- Added: Security testing -->
  * XSS injection attempts
  * CSRF token validation
  * Rate limiting verification
  * Authentication bypass attempts

* **Performance Tests:** <!-- Added: Performance testing -->
  * Lighthouse CI for Core Web Vitals
  * Bundle size monitoring
  * API response time benchmarks
  * Memory leak detection

* **Accessibility Tests:** <!-- Added: A11y testing -->
  * axe-core integration
  * Keyboard navigation tests
  * Screen reader compatibility
  * WCAG AA compliance checks

## 8. Security Considerations

<!-- Added section: Critical for production readiness -->

* **Authentication & Authorization:**
  * MSAL integration with proper token validation
  * Session management via Redis with TTL
  * Role-based access control (RBAC)
  * Secure cookie configuration (httpOnly, secure, sameSite)

* **Data Protection:**
  * HTTPS enforcement via middleware
  * Content Security Policy headers
  * Input sanitization at all entry points
  * Output encoding for XSS prevention

* **Rate Limiting & DDoS Protection:**
  * API rate limiting per user and IP
  * Request size limits
  * Cloudflare or similar CDN integration

* **Monitoring & Logging:**
  * Structured logging with correlation IDs
  * Security event monitoring
  * Error tracking with Sentry
  * Performance monitoring with Vercel Analytics

## 9. Performance Optimization Strategy

<!-- Added section: Performance considerations -->

* **Bundle Optimization:**
  * Code splitting at route level
  * Dynamic imports for heavy components
  * Tree shaking and dead code elimination
  * Compression (gzip/brotli)

* **Runtime Performance:**
  * React.memo for expensive components
  * useMemo/useCallback for expensive computations
  * Virtual scrolling for message lists
  * Web Workers for heavy processing

* **Network Optimization:**
  * HTTP/2 push for critical resources
  * Prefetching for likely navigation
  * Service Worker for offline support
  * CDN for static assets

## 10. Deployment & DevOps

<!-- Added section: Deployment considerations -->

* **CI/CD Pipeline:**
  * GitHub Actions for automation
  * Pre-commit hooks with Husky
  * Automated testing on PR
  * Semantic versioning

* **Environment Management:**
  * Development, staging, production environments
  * Environment-specific configuration
  * Feature flags for gradual rollout
  * Rollback strategy

* **Monitoring:**
  * Uptime monitoring
  * Error tracking
  * Performance metrics
  * User analytics (privacy-compliant)
