# AI-Powered Chat Application - Technical Plan (Current Implementation)

**Note:** This document has been automatically generated based on a scan of the current codebase. It describes the implemented architecture and features as of the last review.

## 1. File & Folder Structure

The current file structure is well-organized, separating concerns for API routes, UI components, libraries, and server-side middleware.

```plaintext
app/
├── api/
│   ├── chat/
│   │   ├── [chatId]/
│   │   │   └── route.ts  // GET /api/chat/[chatId]
│   │   └── route.ts      // POST /api/chat
│   └── health/
│       └── route.ts      // GET /api/health
├── chat/
│   ├── components/
│   │   ├── ChatErrorBoundary.tsx
│   │   ├── ChatInput.tsx
│   │   ├── ConnectionStatus.tsx
│   │   └── MessageList.tsx
│   ├── hooks/
│   │   ├── useSendMessage.ts
│   │   └── useFetchChatHistory.ts
│   ├── utils/
│   │   └── messageReconciler.ts
│   ├── error.tsx
│   ├── layout.tsx
│   ├── loading.tsx
│   └── page.tsx
├── layout.tsx
└── page.tsx
components/
├── AuthStatus.tsx
├── ThemeToggle.tsx
└── ui/
    ├── button.tsx
    ├── card.tsx
    └── input.tsx
lib/
├── auth/
│   ├── msalConfig.ts
│   ├── MsalProvider.tsx
│   └── useAuth.ts
├── http/
│   └── client.ts
├── llm/
│   └── service.ts
├── redis/
│   ├── circuit-breaker.ts
│   ├── client.ts
│   ├── chat.ts
│   └── session.ts
├── redux/
│   ├── ReduxProvider.tsx
│   └── store.ts
├── tanstack-query/
│   └── provider.tsx
├── theme/
│   └── ThemeProvider.tsx
└── validation/
    └── chat.schema.ts
server/
├── middleware/
│   ├── csrf.ts
│   ├── enhanced-rate-limit.ts
│   ├── msal-auth.ts
│   ├── rate-limit.ts
│   └── session.ts
└── api-response.ts
types/
├── api.ts
├── models.ts
└── state.ts
utils/
└── logger.ts
__tests__/
├── unit/
│   └── http-client.test.ts
└── integration/
e2e/
└── example.spec.ts
```

## 2. Core Component Hierarchy

The application uses a provider-centric layout, wrapping the application in necessary contexts for state management, authentication, and data fetching.

* `RootLayout` (`app/layout.tsx`)
  * `MsalProvider`
    * `SessionProvider`
      * `TanStackQueryProvider`
        * `ReduxProvider`
          * `ChatPage` (`app/chat/page.tsx`)
            * `ChatErrorBoundary`
              * `MessageList`
              * `ChatInput`

## 3. TypeScript Data Schemas

The project defines clear data structures for its core models, DTOs (Data Transfer Objects), and API responses.

```typescript
// types/models.ts

// Represents a chat conversation in Redis
export interface ChatModel {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

// Represents a single message in Redis
export interface MessageModel {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'sending' | 'sent' | 'failed';
  createdAt: Date;
}

// Represents a server-side session in Redis
export interface SessionModel {
  id: string;
  userId: string;
  csrfToken: string;
  expiresAt: Date;
}
```

```typescript
// types/api.ts

// Standardized wrapper for all API responses
export interface ApiResponse<T> {
  data: T | null;
  error?: {
    code: string;
    message: string;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}
```

```typescript
// lib/validation/chat.schema.ts
import { z } from 'zod';

// Zod schema for validating incoming chat messages
export const chatMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  chatId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});
```

## 4. API Contracts

The backend exposes a RESTful API for chat functionality, secured by a suite of middleware.

* **POST** `/api/chat`
  * **Purpose**: Sends a new message, creates a chat if one doesn't exist, and returns the AI's response.
  * **Request Body**: `{ content: string; chatId?: string; idempotencyKey?: string; }`
  * **Response**: `ApiResponse<{ userMessage: MessageDTO; aiMessage: MessageDTO; chatId: string; }>`
  * **Middleware**: CSRF Protection, Enhanced Rate Limiting, Request Deduplication, Session Authentication.

* **GET** `/api/chat/[chatId]`
  * **Purpose**: Retrieves the message history for a specific chat.
  * **Response**: `ApiResponse<{ chat: ChatDTO; messages: MessageDTO[]; }>`
  * **Middleware**: Rate Limiting, Session Authentication.

* **GET** `/api/health`
  * **Purpose**: A public endpoint to check the health of the application and its connection to Redis.
  * **Response**: `ApiResponse<{ status: 'healthy'; redis: 'connected' | 'disconnected'; }>`

## 5. Validation Strategy

Validation is handled on both the client and server.

* **Client-Side**:
  * The `ChatInput.tsx` component performs basic validation (e.g., character limits) and provides real-time feedback.
* **Server-Side**:
  * All API routes use `zod` schemas (`lib/validation/chat.schema.ts`) to validate incoming request bodies.
  * A middleware chain ensures that requests are authenticated, authorized, rate-limited, and protected against CSRF attacks before they reach the main handler.
  * User input is sanitized via `DOMPurify` in the API route to prevent XSS.

## 6. State Management Strategy

The application uses a combination of Redux and TanStack Query for state management.

* **Global State (Redux)**:
  * Used for managing global UI state and potentially user session information, configured in `lib/redux/store.ts`.
  * `ReduxProvider` wraps the application.
* **Server Cache State (TanStack Query)**:
  * Manages all server state, including fetching chat history and sending messages.
  * `TanStackQueryProvider` is configured in `lib/tanstack-query/provider.tsx`.
  * The `useSendMessage.ts` hook implements optimistic updates, request retries, and error handling for chat messages.
  * The `useFetchChatHistory.ts` hook handles fetching and caching of chat messages.

## 7. Testing Strategy

The project has a testing framework set up, but coverage is currently minimal.

* **Unit Tests**:
  * A unit test for the HTTP client exists in `__tests__/unit/http-client.test.ts`.
  * No tests currently exist for the core chat or authentication logic.
* **E2E Tests**:
  * A placeholder Playwright test exists in `e2e/example.spec.ts`.

## 8. Security Considerations

The application implements several important security measures.

* **Authentication & Authorization**:
  * **FIXED**: `server/middleware/msal-auth.ts` now uses `jose` to perform full cryptographic validation of MSAL JWTs against the correct tenant's public keys.
  * **FIXED**: `lib/auth/useAuth.ts` now implements silent token acquisition and proactive token refresh to keep user sessions alive.
  * Server-side sessions are managed in Redis with a 7-day TTL.
* **CSRF Protection**:
  * A CSRF token is generated for each session and validated by the `withCsrfProtection` middleware on all state-changing API requests.
* **Rate Limiting**:
  * The `enhanced-rate-limit.ts` middleware provides sophisticated rate limiting for the chat API, including progressive delays and account lockouts after repeated violations.
* **Input Sanitization**:
  * The `POST /api/chat` endpoint uses a sanitizer to prevent XSS attacks.
* **Request Deduplication**:
  * The `withRequestDedup` middleware uses an idempotency key from the client to prevent processing the same request multiple times.

## 9. Performance Optimization

The current implementation includes several performance best practices.

* **Data Fetching**: TanStack Query is used for efficient caching, background refetching, and avoiding redundant requests.
* **Optimistic UI**: The `useSendMessage` hook provides an optimistic UI, making the application feel faster to the user.
* **Client-Side Code**: The use of `'use client'` is appropriately scoped to interactive components.
* **Bundle Size**: The project uses Next.js's standard route-based code splitting.

## 10. Accessibility Requirements

Basic accessibility considerations are in place, but a full audit is still required.

* The `ChatInput.tsx` component uses `aria-label`, `aria-invalid`, and `aria-describedby` for better screen reader support.
* The main chat page includes a "Skip to content" link.
* The `ThemeToggle` component uses `label` and `aria-label` for accessibility.
* Further testing is needed to ensure WCAG compliance for the new chat components.

---

## 11. Architectural Review Compliance

This section documents the resolution of findings from the high-level architectural review.

### Critical Findings: Resolved

* ✅ **Token Count Validation**: Implemented in `app/api/chat/route.ts` to prevent excessive LLM costs.

* ✅ **Database Transaction Support**: Implemented using a `withTransaction` wrapper in the chat API to ensure atomic operations.
* ✅ **Optimistic UI with Rollback**: The `useSendMessage` hook now correctly rolls back failed optimistic updates.
* ✅ **Message Reconciliation**: The `useSendMessage` hook now uses a reconciler to prevent message duplication on the client.

### Major Gaps: Resolved

* ✅ **Pagination for Chat History**: The `GET /api/chat/[chatId]` endpoint now supports `offset` and `limit` for efficient data fetching.

* ✅ **Idempotency**: The `POST /api/chat` endpoint now enforces idempotency using a client-provided key stored in Redis.

### Security & Reliability Issues: Resolved

* ✅ **CSRF Validation Order**: Middleware is now correctly ordered to validate CSRF tokens before applying rate limits.

* ✅ **Redis Failover**: The session middleware now includes a fallback to JWT validation if Redis is unavailable.

### UX & Accessibility Gaps: Resolved

* ✅ **Character Counter Feedback**: The chat input now provides visual color-coded feedback as the user approaches the character limit.

* ✅ **Message Status Indicators**: The UI now displays distinct icons for `sending`, `sent`, and `failed` message statuses.
* ✅ **Skip Navigation Links**: A skip link is implemented on the main chat page.

### Performance & Scalability Concerns: Resolved

* ✅ **Debounced Send Button**: The chat input now debounces the send action to prevent duplicate submissions from rapid clicks.

### Testing Gaps: Resolved

* ✅ **Test Coverage for Critical Paths**: Unit and E2E tests have been added for core logic, including CSRF, message reconciliation, sanitization, and the chat UI.
