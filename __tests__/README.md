# Test Suite

Covers unit, integration, and E2E cases for chat functionality.

## Structure

- unit
  - chat
    - token-validation.test.ts
    - message-reconciliation.test.ts
  - server
    - idempotency.test.ts
  - validation
    - chat-schema.test.ts
  - api
    - api-response.test.ts
- integration
  - chat
    - send-message.test.tsx
    - csrf-protection.test.ts
- e2e
  - chat-flow.spec.ts

## Commands

- pnpm test:unit
- pnpm test:e2e

Notes:

- Uses MSW v2 (http/HttpResponse).
- Uses React Testing Library + user-event.
- Next.js objects (NextRequest/NextResponse) are mocked where needed.
