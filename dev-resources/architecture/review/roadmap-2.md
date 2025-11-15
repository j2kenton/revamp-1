# Project Roadmap (Validated)

This roadmap has been updated based on a review of the current codebase. It reflects the remaining work required to complete the AI Chat Application.

---

## Phase 0: Align Authentication with Spec (Backend + Frontend)

**Status:** Not Started

**Objective:** Replace the current credentials-based auth flow with MSAL to meet the assignment spec and ensure downstream chat routes receive the correct identity context.

- [ ] **Integrate MSAL authentication:**
  - [ ] Configure MSAL in the frontend login flow and ensure silent refresh works.
  - [ ] Update server-side auth/session logic to trust MSAL tokens and populate the Redux `SessionState`, including `csrfToken`.
  - [ ] **CRITICAL ADD**: Implement MSAL token refresh logic with automatic retry (tokens expire ~1hr)
  - [ ] **CRITICAL ADD**: Store refresh tokens securely (encrypted httpOnly cookies or secure storage)
  - [ ] **ADD**: Implement token expiry monitoring with proactive refresh before expiration
- [ ] **Update documentation and guards:**
  - [ ] Describe the new MSAL-based login in `docs/` and any architecture diagrams.
  - [ ] Ensure existing middleware (session, CSRF, rate limit) reads the MSAL-issued identity so chat ownership checks succeed.

---

## Phase 1: Implement Chat API Endpoints (Backend)

**Status:** Not Started

**Objective:** Create the backend API routes necessary for chat functionality, integrating existing security and infrastructure.

- [ ] **CRITICAL PREREQUISITE: Implement Database Transaction Support**
  - [ ] Set up transaction wrapper utilities for atomic operations
  - [ ] Create rollback strategies for partial failures
  - [ ] Implement optimistic locking for concurrent edit protection

- [ ] **Create `POST /api/chat` route:**
  - [ ] **CRITICAL ADD**: Validate CSRF token BEFORE rate limiting to prevent CSRF attacks
  - [ ] Validate payloads with `chatMessageSchema` via `server/middleware/validation` and sanitize using `sanitizeChatMessage`.
  - [ ] **CRITICAL ADD**: Implement idempotency with client-generated message IDs to prevent duplicates
  - [ ] **CRITICAL ADD**: Use database transaction pattern:
    - [ ] Begin transaction
    - [ ] Save user message with "pending" status
    - [ ] Save AI response or mark message as "failed"
    - [ ] Commit or rollback based on success
  - [ ] **ADD**: Calculate and validate token count before sending to LLM
  - [ ] Ensure the authenticated user owns the chat (or create if new) before persistence.
  - [ ] Persist the message along with LLM metadata (model, tokens, latency) and mark initial status.
  - [ ] Invoke the LLM service with a 30s timeout, wrapping unpredictable calls in `try/catch` and logging via `utils/logger`.
  - [ ] Return the created message inside the standardized `ApiResponse<T>` and propagate meaningful error codes through `server/api-response`.
- [ ] **Create `GET /api/chat/[chatId]` route:**
  - [ ] Require an authenticated session and verify the chat belongs to the current user.
  - [ ] Fetch ordered history plus metadata (status, tokens) so the UI can render status indicators.
  - [ ] Return data via `ApiResponse<T>` and attach cache headers (`private, max-age=300`) where appropriate.

- [ ] **ADD: Create WebSocket/SSE endpoint for streaming responses**
  - [ ] Implement connection management with heartbeat
  - [ ] Add reconnection logic with exponential backoff
  - [ ] Handle connection drops gracefully with state recovery

- [ ] **Integrate Middleware & Security Gates:**
  - [ ] Wrap both endpoints with `withChatRateLimit` for per-user throttling.
  - [ ] Apply `withCsrfProtection` + `requireSession` so only authenticated sessions with valid CSRF headers can mutate state.
  - [ ] **ADD**: Implement request deduplication middleware
  - [ ] Add structured logging for validation failures, rate-limit hits, and LLM errors.
  - [ ] Guarantee every exit path returns via the API response helpers for consistent metadata and retry headers.

---

## Phase 2: Build Foundational Chat UI (Frontend)

**Status:** Not Started

**Objective:** Construct the core visual components of the chat interface.

- [ ] **Scaffold Directories:**
  - [ ] Create the `app/chat/` directory.
  - [ ] Create the `app/chat/components/` subdirectory.
  - [ ] **ADD**: Create `app/chat/loading.tsx` for loading states
  - [ ] **ADD**: Create `app/chat/error.tsx` for error boundary

- [ ] **Build Static Components:**
  - [ ] **`ChatPage` (`app/chat/page.tsx`):** Create the main layout for the chat window (header, message area, input footer).
  - [ ] **`MessageList.tsx`:** Build the component to display a list of messages, using mock data initially.
  - [ ] **`ChatMessage.tsx`:** Build the component to render a single message bubble, with styles for user vs. AI.
    - [ ] **ADD**: Add status indicators (sending, sent, error)
  - [ ] **`ChatInput.tsx`:** Build the user input form with a text field and send button.
    - [ ] **ADD**: Implement debounced validation (300ms)
    - [ ] **ADD**: Add character counter with visual feedback
    - [ ] **ADD**: Implement keyboard shortcuts (Enter to send, Shift+Enter for newline)

- [ ] **ADD: Build Loading and Error Components:**
  - [ ] **`MessageSkeleton.tsx`:** Create skeleton loader for messages
  - [ ] **`ChatErrorBoundary.tsx`:** Create error boundary with recovery options
  - [ ] **`ConnectionStatus.tsx`:** Show WebSocket/SSE connection state

---

## Phase 3: Connect UI to API and Add Features (Frontend)

**Status:** Not Started

**Objective:** Make the chat UI dynamic, connect it to the backend, and implement core interactive features.

- [ ] **Create Data Hooks:**
  - [ ] **`useSendMessage`:** Create a TanStack Query mutation hook that calls the `POST /api/chat` endpoint, automatically attaching the stored `csrfToken` in the `X-CSRF-Token` header.
    - [ ] **CRITICAL ADD**: Implement optimistic updates with rollback on failure
    - [ ] **ADD**: Include retry logic with exponential backoff
    - [ ] **ADD**: Handle idempotency key generation
  - [ ] **`useFetchChatHistory`:** Create a TanStack Query query hook that calls the `GET /api/chat/[chatId]` endpoint.
    - [ ] **ADD**: Configure stale-while-revalidate strategy
  - [ ] **ADD: `useStreamingResponse`:** Create hook for WebSocket/SSE streaming
    - [ ] Implement connection management
    - [ ] Handle reconnection with state recovery
    - [ ] Progressive message updates

- [ ] **Connect Components to Hooks & Existing Redux Flow:**
  - [ ] In `MessageList.tsx`, replace mock data with live data from `useFetchChatHistory` and reconcile it with Redux-stored optimistic updates.
    - [ ] **ADD**: Implement proper message reconciliation (temp ID to server ID)
    - [ ] **ADD**: Handle duplicate detection and merging
  - [ ] In `ChatInput.tsx`, wire submissions to `useSendMessage`, dispatching `chatActions.addOptimisticUpdate` / `removeOptimisticUpdate` so TanStack and Redux stay in sync.
    - [ ] **ADD**: Implement send button debouncing to prevent double-clicks

- [ ] **Implement Core UX Features (Roadmap Task A & B):**
  - [ ] **Optimistic UI:** Use TanStack Query's `onMutate` plus the Redux chat slice to insert optimistic messages, rolling them back on `onError`.
  - [ ] **Rich Feedback:**
    - [ ] Display visual indicators for message status (Sending, Sent, Failed) in `ChatMessage.tsx`.
    - [ ] Add a character counter to `ChatInput.tsx`.

---

## Phase 3.5: Critical Security & Reliability Enhancements

**Status:** Not Started  
**Objective:** Address the most critical security and reliability issues identified in the architecture review.

- [ ] **Redis Failover & Circuit Breaker:**
  - [ ] Implement Redis connection pooling with health checks
  - [ ] Add fallback to JWT validation when Redis is unavailable
  - [ ] Create circuit breaker pattern with graceful degradation

- [ ] **Enhanced Rate Limiting:**
  - [ ] Implement progressive delays after failed attempts
  - [ ] Add account lockout mechanism after X failures
  - [ ] Create user-friendly countdown timers in UI

---

## Phase 4: Polish and Finalize

**Status:** Not Started

**Objective:** Address cross-cutting concerns like theming, accessibility, testing, and documentation.

- [ ] **Theming:**
  - [ ] Implement dark and light mode support.
  - [ ] Add a UI control for the user to toggle the theme.
  - [ ] **ADD**: Persist theme preference in localStorage
  - [ ] **ADD**: Respect system theme preference by default

- [ ] **Accessibility (Roadmap Task K):**
  - [ ] Audit all new chat components for keyboard accessibility (tab order, focus management).
  - [ ] Ensure correct ARIA roles and attributes are used for screen readers.
  - [ ] Verify color contrast ratios meet WCAG AA standards in both themes.
  - [ ] **ADD**: Implement skip navigation links
  - [ ] **ADD**: Add aria-live regions for dynamic updates

- [ ] **Testing:**
  - [ ] Write unit tests for new hooks and utility functions.
    - [ ] **ADD**: Test idempotency logic
    - [ ] **ADD**: Test token refresh flows
    - [ ] **ADD**: Test transaction rollback scenarios
  - [ ] Write integration tests for the `ChatPage` to ensure all components work together.
    - [ ] **ADD**: Test optimistic update reconciliation
    - [ ] **ADD**: Test streaming message updates
  - [ ] Write an E2E test for the complete chat flow (login, send message, verify message appears).
    - [ ] **ADD**: Test rate limiting behavior
    - [ ] **ADD**: Test session timeout and recovery
    - [ ] **ADD**: Test multi-tab synchronization
  - [ ] **ADD: Security Testing:**
    - [ ] Test CSRF protection
    - [ ] Test XSS prevention in message rendering
    - [ ] Test rate limiting effectiveness

- [ ] **Performance Optimization:**
  - [ ] **ADD**: Add performance monitoring (Web Vitals)
  - [ ] **ADD**: Optimize bundle size (tree shaking, dynamic imports)

- [ ] **Documentation:**
  - [ ] Create a `WALKTHROUGH.md` document explaining the project architecture and setup.
    - [ ] **ADD**: Document authentication flow with token lifecycle
    - [ ] **ADD**: Document deployment considerations
  - [ ] Record a short video demonstrating the final application.
    - [ ] **ADD**: Show accessibility features in action

- [ ] **ADD: Monitoring & Observability:**
  - [ ] Create health check endpoints

---

## Completed Infrastructure Tasks

The following foundational tasks were found to be already implemented during the code review:

- **Backend:**
  - ✔️ Standardized API Response (`ApiResponse<T>`)
  - ✔️ Redis Client and Session Management
  - ✔️ CSRF Protection Middleware
  - ✔️ Zod Validation Schemas
  - ✔️ Rate Limiting Middleware
- **Frontend:**
  - ☐ MSAL Authentication (pending per Phase 0; legacy credentials flow exists today)
  - ✔️ TanStack Query and Redux Providers
  - ✔️ Login Page UI foundation (to be updated for MSAL)

---

## Risk Mitigation

**High-Risk Items Requiring Immediate Attention:**

1. **CSRF Token Validation**: Must be implemented before any state-changing endpoints go live
2. **Token Refresh Logic**: Critical for preventing hourly session breaks
3. **Database Transactions**: Essential for data consistency in chat flow
4. **Redis Failover**: Single point of failure without proper fallback
5. **WebSocket/SSE Recovery**: Poor UX without proper connection management

**Recommended Parallel Work Streams:**

- Security team: Focus on Phase 0 (MSAL) + Phase 3.5 (Security)
- Backend team: Phase 1 (API) with emphasis on transactions
- Frontend team: Phase 2 (UI) + Phase 3 (Integration)
- DevOps team: Redis failover, monitoring, deployment pipeline
