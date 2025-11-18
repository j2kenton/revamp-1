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

## Architecture Overview

This is a full-stack Next.js application with the following architecture:

### Technology Stack

- **Frontend**: Next.js 16 (React 19), TailwindCSS, TypeScript
- **State Management**: Redux + TanStack Query (React Query)
- **Authentication**: Microsoft MSAL (Azure AD)
- **Backend**: Next.js API Routes
- **Data Storage**: Redis (sessions, chat data, rate limiting)
- **AI Integration**: Mock LLM service (ready for OpenAI/Anthropic integration)

### Directory Structure

```plaintext
/app
  /api
    /auth          - NextAuth configuration
    /chat          - Chat API endpoints
      /[chatId]    - Get chat history
      /stream      - SSE streaming endpoint
  /chat            - Chat UI pages
    /components    - Chat components
    /hooks         - React hooks for chat
  /login           - MSAL login page
/lib
  /auth            - MSAL configuration and hooks
  /llm             - LLM service integration
  /redis           - Redis clients and utilities
  /theme           - Theme provider
  /validation      - Zod schemas
/server
  /middleware      - API middleware
/types             - TypeScript types
```

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
   - Server validates MSAL token via `server/middleware/msal-auth.ts`
   - **Token Signature Verification**: Cryptographically validates tokens using Azure AD public keys (JWKS)
   - Validates issuer, audience, expiration, and required claims
   - Session created in Redis with CSRF token
   - Session ID stored in httpOnly cookie

5. **Token Storage**
   - Access tokens: sessionStorage (client-side)
   - Refresh tokens: httpOnly cookies (server-side)
   - Session data: Redis with 7-day TTL

### Security Measures

- CSRF token validation on all state-changing requests
- httpOnly cookies prevent XSS attacks
- Secure flag enabled in production
- SameSite=lax for CSRF protection
- Token expiry monitoring with proactive refresh

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

Enhanced rate limiting with:

- **Progressive Delays**: 1s, 2s, 4s, 8s after violations
- **Account Lockout**: Lock after 3 violations for 15 minutes
- **Per-Endpoint Configuration**: Custom limits per API
- **Circuit Breaker**: Graceful degradation when Redis is down

```typescript
// Example: Chat rate limiting
- 20 messages per minute per user
- Progressive delays after violations
- 15-minute lockout after 3 violations
```

### Content Sanitization

- All user input sanitized via DOMPurify
- XSS prevention in message rendering
- Script tag removal
- Safe URL validation

### Database Transactions

- Atomic operations prevent partial failures
- Optimistic locking for concurrent edits
- Automatic rollback on error
- Idempotency for retry safety

## Performance & Reliability

### Redis Resilience

#### Circuit Breaker Pattern

- Opens after 5 consecutive failures
- Half-open state after 30s
- Closes after 2 successful requests
- Graceful degradation with fallbacks

#### Connection Pooling

- Health checks every 30s
- Automatic reconnection
- Exponential backoff (max 5s)
- Offline queue for requests

#### Fallback Strategies

- JWT validation when Redis unavailable
- Allow requests if rate limiting fails
- Cache session data client-side

### Frontend Performance

- **Code Splitting**: Dynamic imports for routes
- **Lazy Loading**: Components loaded on demand
- **Stale-While-Revalidate**: TanStack Query caching
- **Optimistic Updates**: Instant UI feedback
- **Debounced Validation**: 300ms delay on input

### Monitoring

#### Health Check Endpoint

`GET /api/health` provides comprehensive application health status:

```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy',
  timestamp: '2025-01-15T...',
  uptime: 12345,
  checks: {
    redis: {
      status: 'healthy',
      latency: 5
    },
    memory: {
      status: 'healthy',
      usage: {
        heapUsed: 45,  // MB
        heapTotal: 128,
        external: 2,
        rss: 150
      },
      usagePercent: 35
    },
    process: {
      status: 'healthy',
      pid: 1234,
      version: 'v20.x.x',
      platform: 'linux'
    }
  }
}
```

#### Web Vitals Monitoring

Real-time performance metrics tracked and reported:

- **Core Web Vitals**:
  - CLS (Cumulative Layout Shift)
  - FID (First Input Delay)
  - LCP (Largest Contentful Paint)

- **Additional Metrics**:
  - FCP (First Contentful Paint)
  - INP (Interaction to Next Paint)
  - TTFB (Time to First Byte)

Metrics are automatically sent to `/api/analytics/web-vitals` for analysis and aggregation.

**Implementation**:

- `lib/monitoring/web-vitals.ts` - Metric collection
- `components/WebVitalsReporter.tsx` - Client-side integration
- `app/api/analytics/web-vitals/route.ts` - Endpoint for receiving metrics

## Testing

### Test Coverage

#### Unit Tests

Located in `__tests__/unit/`:

- **Message Reconciliation** (`message-reconciler.test.ts`)
  - Duplicate message handling
  - Optimistic update replacement
  - Client request ID matching

- **Chat Components** (`ChatMessage.test.tsx`)
  - Message rendering
  - Status indicators
  - Accessibility attributes
  - Timestamp formatting

- **Sanitization** (`sanitizer.test.ts`)
  - HTML sanitization
  - XSS prevention
  - URL validation
  - Special character escaping

- **CSRF Protection** (`csrf.test.ts`)
  - Token generation
  - Token validation
  - Mismatch detection

- **Existing Tests**:
  - Authentication hooks
  - Validation schemas
  - HTTP client
  - Session hydration
  - Rate limiting

#### Integration Tests

Located in `__tests__/integration/`:

- Chat flow (send → receive)
- Session management
- Error recovery

#### E2E Tests

Using Playwright (`e2e/chat.spec.ts`):

- **Chat Interface**
  - Empty state display
  - Message input accessibility
  - Character counter functionality
  - Send button states
  - Keyboard shortcuts (Enter, Shift+Enter)
  - Character limit validation
  - ARIA attributes

- **Accessibility**
  - Heading structure
  - Landmark roles
  - Keyboard navigation
  - Screen reader compatibility

- **Responsive Design**
  - Mobile viewport (375x667)
  - Tablet viewport (768x1024)
  - Desktop viewport (1920x1080)

#### Security Tests

- CSRF protection
- XSS prevention
- Rate limiting effectiveness
- Token signature verification
- URL sanitization
- SQL injection (N/A - using Redis)

### Running Tests

```bash
# Unit tests
npm run test:unit

# Integration tests
npm test

# E2E tests
npm run test:e2e

# With coverage
npm run test:unit:coverage
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
# OR
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

# NextAuth (for session secret)
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000

# Don't hardcode this key!!! Always store credentials in a safe location and access them securely!!!
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_ORGANIZATION_ID=
OPENAI_PROJECT_ID=
ANTHROPIC_API_KEY=
```

### Build & Run

```bash
# Install dependencies
npm install

# Development
npm run dev

# Production build
npm run build
npm start

# Type check
npm run type-check

# Lint
npm run lint
```

### Deployment Platforms

#### Vercel (Recommended)

```bash
# Install Vercel CLI
# Add Redis via Upstash integration

# Deploy
vercel

# Add environment variables in Vercel dashboard
# Add Redis via Upstash integration
```

#### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

#### Environment-Specific Considerations

- Use managed Redis (Upstash, Redis Cloud)
- Enable Redis TLS in production
- Set `NODE_ENV=production`
- Use HTTPS for all endpoints

### Deployment Considerations

- **Secrets Management:** Store MSAL client/tenant IDs, `NEXTAUTH_SECRET`, and LLM keys in the platform secret store (Vercel env vars, GitHub OIDC, etc.). Never commit them to the repo.
- **Redis Availability:** Configure health checks and connect the `REDIS_URL` to a highly available cluster. The app now fails over to JWT validation when Redis is down, but Redis should still auto-recover to re-enable server sessions.
- **Rate Limiting:** Keep `ENABLE_RATE_LIMITING` enabled in production so the new chat-specific throttling, progressive delays, and lockouts remain active. Tune `RATE_LIMITS.CHAT_MESSAGE` to match your traffic profile.
- **Origin Security:** Serve the app behind HTTPS and a WAF. Set `NEXTAUTH_URL` and allowed CORS origins precisely to avoid token leakage.
- **Observability:** Provision logging and monitoring (Datadog, Azure Monitor). Enable structured logs for chat APIs and wire them to alerting for rate-limit spikes or JWT fallback usage.
- **Smoke Tests:** Run the provided unit/integration suites plus sanity E2E (login → chat → rate-limit) against the deployment target before promoting traffic.
- Enable security headers

## Environment Variables Reference

### Required

| Variable                         | Description            | Example                                 |
| -------------------------------- | ---------------------- | --------------------------------------- |
| `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` | Azure AD Client ID     | `abc123...`                             |
| `NEXT_PUBLIC_AZURE_AD_TENANT_ID` | Azure AD Tenant ID     | `def456...`                             |
| `REDIS_URL`                      | Redis connection URL   | `redis://localhost:6379`                |
| `NEXTAUTH_SECRET`                | Session encryption key | Generate with `openssl rand -base64 32` |

### Optional

| Variable                   | Description         | Default     |
| -------------------------- | ------------------- | ----------- |
| `NEXT_PUBLIC_REDIRECT_URI` | Post-login redirect | `/`         |
| `REDIS_HOST`               | Redis host          | `localhost` |
| `REDIS_PORT`               | Redis port          | `6379`      |
| `REDIS_PASSWORD`           | Redis password      | -           |
| `REDIS_TLS`                | Enable TLS          | `false`     |

## Accessibility

The application has been audited for WCAG 2.1 Level AA compliance. See `ACCESSIBILITY_AUDIT.md` for the full report.

### Key Accessibility Features

- **Semantic HTML**: Proper use of ARIA roles, labels, and landmarks
- **Keyboard Navigation**: Full keyboard support with visible focus indicators
- **Screen Reader Support**: Live regions, status messages, and descriptive labels
- **Color Contrast**: All color combinations meet WCAG AA standards (4.5:1 minimum)
- **Focus Management**: Logical tab order and focus trap prevention
- **Error Handling**: Clear error messages with `role="alert"` and `aria-live`

### Component-Specific Features

- **MessageList**: `role="log"` with `aria-live="polite"` for dynamic updates
- **ChatMessage**: `role="article"` with descriptive `aria-label`
- **ChatInput**: `aria-invalid`, `aria-describedby`, keyboard shortcuts
- **MessageSkeleton**: `role="status"` with loading announcement
- **ConnectionStatus**: Status indicators with both color and text

**Audit Result**: ✅ WCAG 2.1 Level AA Compliant

## Key Features Summary

✅ **MSAL Authentication** with cryptographic token verification
✅ **Automatic Token Refresh** with proactive expiry monitoring
✅ **Real-time Chat** with AI responses
✅ **SSE Streaming** for progressive responses
✅ **Optimistic Updates** for instant feedback
✅ **CSRF Protection** on all mutations
✅ **Enhanced Rate Limiting** with progressive delays and lockouts
✅ **Redis Circuit Breaker** for resilience
✅ **Database Transactions** for consistency
✅ **Idempotency** for duplicate prevention
✅ **Content Sanitization** with DOMPurify (XSS prevention)
✅ **Dark/Light Theme** with system preference
✅ **Accessibility** (WCAG 2.1 Level AA compliant)
✅ **Comprehensive Testing** (unit, integration, E2E)
✅ **Performance Monitoring** with Web Vitals
✅ **Health Check Endpoint** for monitoring

## Troubleshooting

### Common Issues

#### MSAL authentication fails

- Check Azure AD app registration
- Verify redirect URIs match exactly
- Ensure Client ID and Tenant ID are correct
- Check browser console for MSAL errors

#### Redis connection errors

- Verify Redis is running: `redis-cli ping`
- Check connection string format
- Enable TLS if using Redis Cloud
- Review circuit breaker logs

#### Rate limiting too aggressive

- Adjust limits in `server/middleware/enhanced-rate-limit.ts`
- Clear rate limit keys: `redis-cli DEL ratelimit:*`
- Check lockout status: `redis-cli GET lockout:chat:userId`

#### Session expires too quickly

- Token refresh logic in `lib/auth/useAuth.ts`
- Check token expiry buffer (default: 5 minutes)
- Verify silent token acquisition works

## Next Steps

### Production Readiness

1. **LLM Integration**: Replace mock service with OpenAI/Anthropic
2. **Database Migration**: Consider PostgreSQL for chat history
3. **Monitoring**: Add Sentry, DataDog, or similar
4. **CDN**: Use Cloudflare or similar for static assets
5. **Load Balancing**: Add multiple instances
6. **Backup**: Implement Redis backup strategy

### Future Enhancements

- Message editing and deletion
- File/image upload support
- Multi-user chat rooms
- Chat search functionality
- Export chat history
- Voice input/output
- Mobile app (React Native)

---

**Need Help?**

- Review code comments for implementation details
- Check `/dev-resources/architecture/` for diagrams
- File issues in project repository
