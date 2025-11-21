# AI Chat Application - Project Walkthrough

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication Flow](#authentication-flow)
3. [Chat System](#chat-system)
4. [Security Features](#security-features)
5. [Performance & Reliability](#performance--reliability)
6. [Testing](#testing)
7. [Deployment](#deployment)
8. [Environment Variables](#environment-variables)
9. [See Also](#see-also)

## Architecture Overview

This is a full-stack Next.js application with the following architecture:

### Technology Stack

- **Frontend**: Next.js 16 (React 19), TailwindCSS, TypeScript, shadcn-ui
- **State Management**: Redux + TanStack Query (React Query)
- **Authentication**: Microsoft MSAL (Azure AD)
- **Backend**: Next.js API Routes
- **Data Storage**: Redis (sessions, chat data, rate limiting)
- **AI Integration**: Google Gemini

### Directory Structure

```plaintext
app/
├── api/
│   ├── chat/
│   │   ├── route.ts
│   │   └── stream/
│   │       └── route.ts
│   └── auth/
│       └── [...nextauth]/
│           └── route.ts
├── chat/
│   ├── page.tsx
│   └── components/
│       ├── ChatHeader.tsx
│       ├── ChatInput.tsx
│       ├── ChatErrorBoundary.tsx
│       ├── ChatSignInPrompt.tsx
│       └── MessageList.tsx
├── login/
│   └── page.tsx
├── layout.tsx
└── page.tsx
components/
├── ui/
│   ├── button.tsx
│   └── input.tsx
└── ThemeToggle.tsx
lib/
├── auth/
│   ├── msalConfig.ts
│   ├── SessionProvider.tsx
│   └── useAuth.ts
├── llm/
│   └── service.ts
├── redis/
│   ├── chat.ts
│   ├── client.ts
│   └── keys.ts
└── constants/
    ├── common.ts
    └── strings.ts
server/
└── middleware/
    ├── csrf.ts
    ├── rate-limit.ts
    └── session.ts
types/
└── models.ts
```

### High-Level Architecture

[High-Level Architecture](dev-resources/architecture/review/diagrams/overview/high_level_architecture.md)

## Authentication Flow

### MSAL Integration

The application uses Microsoft Authentication Library (MSAL) for Azure AD authentication:

1. **User clicks "Sign in with Microsoft"**
   - `app/login/page.tsx` handles the login UI
   - `lib/auth/useAuth.ts` provides authentication methods

2. **MSAL Popup Flow**
   - User authenticates via Microsoft popup
   - MSAL returns access token and user info
   - Token stored in sessionStorage (secure)

3. **Token Lifecycle**
   - Access tokens expire in ~1 hour
   - `lib/auth/useAuth.ts` monitors token expiry
   - Automatic silent refresh before expiration
   - Retry logic with exponential backoff

4. **Session Creation**
   - Server validates MSAL token via `server/middleware/session.ts`
   - Session created in Redis with CSRF token
   - Session ID stored in httpOnly cookie

### Authentication Flow Diagram

[Authentication Flow](dev-resources/architecture/review/diagrams/user/authentication_flow.md)

## Chat System

### Data Flow

1. **User sends message**
   - `ChatInput` component captures input
   - `useSendMessage` hook sends to `/api/chat`
   - Optimistic update shows message immediately

2. **Server processing**
   - CSRF validation (critical!)
   - Rate limiting check
   - Session verification
   - Message sanitization (XSS prevention)
   - Idempotency check (prevent duplicates)

3. **Database transaction**
   - User message saved to Redis
   - LLM called with timeout (30s)
   - AI response saved
   - Transaction committed or rolled back

4. **Response handling**
   - Success: Update cache with server response
   - Error: Rollback optimistic update
   - Retry with exponential backoff

### Streaming Responses (SSE)

For real-time AI responses:

1. Client connects to `/api/chat/stream`
2. Server streams tokens as they arrive
3. Client updates UI progressively
4. Heartbeat messages prevent timeout
5. Automatic reconnection on disconnect

### SSE Flow Diagram

[Real-time Chat Flow (SSE)](dev-resources/architecture/review/diagrams/chat/sse_flow.md)

### Key Features

- **Optimistic Updates**: Instant UI feedback
- **Idempotency**: Prevent duplicate messages (24h key TTL)
- **Token Validation**: Check context length before API call
- **Transaction Support**: Atomic operations with rollback
- **Message Reconciliation**: Temp ID → Server ID mapping
- **Status Indicators**: sending, sent, failed, read

## Security Features

### CSRF Protection

- Token generated per session
- Validated BEFORE rate limiting (prevent CSRF attacks)
- Token rotated on privilege escalation
- Middleware: `server/middleware/csrf.ts`

### Rate Limiting

- Per-user and per-IP rate limiting
- Sliding window counters in Redis
- Configurable limits per endpoint
- Middleware: `server/middleware/rate-limit.ts`

### Content Sanitization

- All user input sanitized via DOMPurify
- XSS prevention in message rendering
- `lib/sanitizer.ts`

## Performance & Reliability

### Redis Resilience

- **Circuit Breaker**: Prevents repeated calls to a failing service.
- **Connection Pooling**: Efficiently manages Redis connections.
- **Retry Logic**: Exponential backoff for transient errors.

### Frontend Performance

- **Code Splitting**: Automatic per-page code splitting.
- **Lazy Loading**: Components loaded on demand.
- **Stale-While-Revalidate**: TanStack Query caching.
- **Optimistic Updates**: Instant UI feedback.
- **Debounced Validation**: 300ms delay on input.

### Monitoring

- **Web Vitals**: `components/WebVitalsReporter.tsx` reports Core Web Vitals.
- **Logging**: `utils/logger.ts` provides structured logging.

## Testing

### Test Coverage

- **Unit Tests**: Jest and React Testing Library for components and utilities.
- **Integration Tests**: Jest and MSW for API and feature workflows.
- **E2E Tests**: Playwright for full user journeys.

### Running Tests

```bash
# Unit tests
pnpm test:unit

# Integration tests
pnpm test

# E2E tests
pnpm test:e2e
```

## Deployment

### Prerequisites

- Node.js 20+
- Redis instance (or Redis Cloud)
- Azure AD application registration

### Azure AD Setup

1. Register application in Azure Portal
2. Configure redirect URIs:
   - `http://localhost:3000` (dev)
   - `https://your-domain.com` (prod)
3. Enable ID tokens and access tokens
4. Note: Client ID, Tenant ID

### Environment Variables

Create `.env.local`:

```bash
# Azure AD / MSAL
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=your_client_id
NEXT_PUBLIC_AZURE_AD_TENANT_ID=your_tenant_id
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000
NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI=http://localhost:3000/login

# Redis
REDIS_URL=redis://localhost:6379

# NextAuth (for session secret)
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key
```

### Build & Run

```bash
# Install dependencies
pnpm install

# Development
pnpm dev

# Production build
pnpm build
pnpm start
```

### Deployment Platforms

- **Vercel (Recommended)**: The easiest way to deploy your Next.js app.
- **Docker**: A `Dockerfile` is provided for containerized deployments.

### Deployment Diagram

[Deployment Architecture](dev-resources/architecture/review/diagrams/deployment/deployment.md)

## Accessibility

The application has been audited for WCAG 2.1 Level AA compliance. See `ACCESSIBILITY_AUDIT.md` for the full report.

### Key Accessibility Features

- **Semantic HTML**: Proper use of ARIA roles, labels, and landmarks
- **Keyboard Navigation**: Full keyboard support with visible focus indicators
- **Screen Reader Support**: Live regions, status messages, and descriptive labels
- **Color Contrast**: All color combinations meet WCAG AA standards (4.5:1 minimum)
- **Focus Management**: Logical tab order and focus trap prevention
- **Error Handling**: Clear error messages with `role="alert"` and `aria-live`

## See Also

- **[Architecture Diagrams](dev-resources/architecture/review/diagrams)**: For a more detailed look at the application's architecture.
