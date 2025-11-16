# Project Roadmap 3 - Final Enhancements

This roadmap outlines the final set of enhancements required to complete the AI Chat Application, focusing on advanced features for user experience and resilience.

---

## Phase 5: Real-Time and Long-Conversation UX

**Status:** Not Started

**Objective:** Enhance the user experience for long-running AI responses and lengthy chat histories by implementing streaming and performance optimizations.

- [ ] **Implement Streaming API Responses (SSE):**
  - [ ] Create a new `GET /api/chat/stream` Server-Sent Events (SSE) endpoint.
  - [ ] Modify the LLM service to support streaming tokens as they are generated.
  - [ ] Implement connection management on the server, including heartbeat messages to prevent timeouts.
  - [ ] Add robust error handling and reconnection logic on the client.

- [ ] **Integrate Streaming on the Frontend:**
  - [ ] Create a `useStreamingResponse` hook to manage the SSE connection and process incoming data chunks.
  - [ ] Update the `ChatMessage` component to progressively render the AI's response as tokens arrive.
  - [ ] Ensure the optimistic UI works seamlessly with the streaming response.

- [ ] **Implement Virtual Scrolling for Message History:**
  - [ ] Integrate a virtual scrolling library (e.g., TanStack Virtual) into the `MessageList` component.
  - [ ] Ensure smooth scrolling performance for conversations with thousands of messages.
  - [ ] Test for and resolve any focus management or accessibility issues introduced by virtual scrolling.

---

## Phase 6: Advanced Resilience and Cost Management

**Status:** Not Started

**Objective:** Improve the application's resilience to external service failures and add more sophisticated logic for managing LLM costs.

- [ ] **Implement Circuit Breaker for LLM Service:**
  - [ ] Wrap the `callLLMWithRetry` function in `lib/llm/service.ts` with a circuit breaker pattern.
  - [ ] The circuit should open after a configured number of consecutive LLM failures.
  - [ ] When the circuit is open, the API should immediately return a fallback message without calling the LLM service.
  - [ ] Implement a half-open state to test for LLM service recovery.

- [ ] **Implement Smart Context Window Management:**
  - [ ] Instead of rejecting requests that exceed the token limit, implement a smart truncation strategy.
  - [ ] The strategy should summarize or remove the oldest messages in the context to fit within the LLM's context window.
  - [ ] Ensure the system message (if any) and the most recent messages are always preserved.
  - [ ] Add a user-facing indicator when the context has been truncated.
