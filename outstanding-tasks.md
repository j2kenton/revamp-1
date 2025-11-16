# Outstanding Project Tasks

This document summarizes the outstanding work required to complete the application, based on a code review against `roadmap-2.md`.

---

## Phase 0: Align Authentication with Spec

- **Status: Partially Implemented (with Critical Flaws)**

- **[ ] CRITICAL FLAW:** Implement cryptographic signature verification for MSAL tokens on the server. The current implementation decodes tokens without verifying them, which is a major security risk.
- **[ ] CRITICAL:** Implement MSAL token refresh logic on the frontend to prevent users from being logged out every hour.
- **[ ]** Implement secure storage for refresh tokens (e.g., httpOnly cookies).
- **[ ]** Add proactive token expiry monitoring to trigger silent refreshes.

---

### Phase 1: Implement Chat API Endpoints

- **Status: Not Started**

- **[ ]** Implement database transaction support (wrappers, rollback strategies).
- **[ ]** Create `POST /api/chat` endpoint with all specified features (CSRF validation, payload sanitization, idempotency, etc.).
- **[ ]** Create `GET /api/chat/[chatId]` endpoint to fetch chat history.
- **[ ]** Create a WebSocket/SSE endpoint for streaming AI responses.
- **[ ]** Integrate all required middleware (`withChatRateLimit`, `withCsrfProtection`, etc.) with the new API routes.

---

### Phase 2: Build Foundational Chat UI

- **Status: Not Started**

- **[ ]** Build the `MessageList.tsx` component to display a list of messages.
- **[ ]** Build the `ChatMessage.tsx` component to render individual messages with status indicators.
- **[ ]** Build the `ChatInput.tsx` component with debounced validation and a character counter.
- **[ ]** Create a `MessageSkeleton.tsx` component for loading states.
- **[ ]** Create a `ChatErrorBoundary.tsx` component for the chat page.
- **[ ]** Create a `ConnectionStatus.tsx` component to show the streaming connection state.

---

### Phase 3: Connect UI to API and Add Features

- **Status: Not Started**

- **[ ]** Create `useSendMessage` TanStack Query mutation hook with optimistic updates and rollback logic.
- **[ ]** Create `useFetchChatHistory` TanStack Query hook.
- **[ ]** Create `useStreamingResponse` hook for handling SSE/WebSocket messages.
- **[ ]** Connect the UI components from Phase 2 to these data hooks.
- **[ ]** Implement message reconciliation (mapping temporary client-side IDs to permanent server-side IDs).

---

### Phase 3.5: Critical Security & Reliability Enhancements

- **Status: Implemented but Inactive**

- **[ ]** Apply the existing security middleware (`enhanced-rate-limit.ts`, `circuit-breaker.ts`, `request-dedup.ts`) to the new chat API endpoints once they are created.

---

### Phase 4: Polish and Finalize

- **Status: Partially Implemented**

- **[ ]** **Accessibility:** Audit all new chat components for ARIA compliance, keyboard navigation, and color contrast.
- **[ ]** **Testing:** Write unit, integration, and E2E tests covering the core application functionality (chat, authentication, etc.) once it is built.
- **[ ]** **Documentation:** Rewrite `WALKTHROUGH.md` to accurately reflect the project's *current* state and features, or update it as features are completed.
- **[ ]** **Monitoring:** Create the `/api/health` health check endpoint.
- **[ ]** **Performance:** Implement Web Vitals monitoring and optimize bundle size.
