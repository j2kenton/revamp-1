# Data Flow Diagram - Fetch User Profile

Based on the AI-Powered Chat Application architecture, this sequence diagram illustrates the complete data flow for fetching a user profile, including authentication, caching, and error handling.

## Fetch User Profile Sequence

```mermaid
sequenceDiagram
    participant Browser as Browser (React Component)
    participant Frontend as Frontend Server (Next.js)
    participant Redis as Redis Cache
    participant Backend as Backend API
    participant Database as Database
    
    Browser->>Frontend: GET /api/auth/session
    Note over Frontend: Middleware validates request
    
    Frontend->>Frontend: Extract session cookie
    alt No session cookie
        Frontend-->>Browser: 401 Unauthorized<br/>ApiResponse with error
    end
    
    Frontend->>Redis: GET session:{sessionId}
    
    alt Session found in Redis
        Redis-->>Frontend: Session data with userId
        Frontend->>Frontend: Hydrate session (dates)
        Note over Frontend: Check session TTL
        
        alt Session expired
            Frontend->>Redis: DEL session:{sessionId}
            Frontend->>Redis: SREM user:{userId}:sessions
            Frontend-->>Browser: 401 Session Expired
        else Session valid
            Frontend->>Redis: Refresh TTL (7 days)
        end
    else Session not found
        Frontend-->>Browser: 401 Unauthorized<br/>ApiResponse with error
    end
    
    Note over Frontend: Session validated, fetch profile
    
    Frontend->>Frontend: Check TanStack Query cache
    alt Profile in cache and fresh
        Frontend-->>Browser: 200 OK (cached)<br/>ApiResponse<User>
    end
    
    Frontend->>Backend: GET /users/{userId}<br/>Headers: Authorization, X-Request-Id
    Note over Backend: Validate MSAL token
    
    alt Invalid token
        Backend-->>Frontend: 401 Token Invalid
        Frontend-->>Browser: 401 Unauthorized<br/>ApiResponse with error
    end
    
    Backend->>Backend: Rate limit check
    alt Rate limit exceeded
        Backend-->>Frontend: 429 Too Many Requests<br/>Retry-After: 60
        Frontend-->>Browser: 429 Rate Limited<br/>ApiResponse with error
    end
    
    Backend->>Database: SELECT * FROM users<br/>WHERE id = ?
    
    alt User found
        Database-->>Backend: User record
        Backend->>Backend: Transform to User model<br/>Add role, timestamps
        Backend-->>Frontend: 200 OK<br/>User data
    else User not found
        Database-->>Backend: Empty result
        Backend-->>Frontend: 404 Not Found
    else Database error
        Database-->>Backend: Connection error
        Backend-->>Frontend: 500 Internal Error
    end
    
    Frontend->>Frontend: Validate response schema (zod)
    
    alt Valid response
        Frontend->>Frontend: Update TanStack Query cache
        Frontend->>Frontend: Wrap in ApiResponse<User>
        Frontend-->>Browser: 200 OK<br/>ApiResponse<User> with meta
    else Invalid response
        Frontend->>Frontend: Log error to Sentry
        Frontend-->>Browser: 500 Data Validation Error
    end
    
    Browser->>Browser: Update Redux state
    Browser->>Browser: Render profile UI
```

## Key Architecture Features Illustrated

### Authentication & Session Management

- **Cookie-based session**: Secure HTTP-only cookies contain session ID
- **Redis session storage**: Server-side session with 7-day TTL
- **Session hydration**: Date strings converted to Date objects
- **Per-user session indexing**: Efficient session lookups via Redis Sets
- **MSAL token validation**: Backend validates Microsoft identity tokens

### Caching Strategy

- **TanStack Query cache**: Client-side caching with stale-while-revalidate
- **Redis session cache**: Server-side session persistence
- **Cache-Control headers**: `private, max-age=0` for session endpoint

### Error Handling

- **Structured errors**: ApiResponse wrapper with error codes
- **Status codes**: Proper HTTP status codes (401, 404, 429, 500)
- **Rate limiting**: 429 response with Retry-After header
- **Error tracking**: Sentry integration for monitoring

### Security Features

- **Session validation**: Every request validates session existence and TTL
- **Token validation**: MSAL tokens verified on backend
- **Rate limiting**: Per-user rate limits enforced
- **Request tracking**: X-Request-Id header for correlation

### Data Transformation

- **Schema validation**: Zod schemas validate all responses
- **Type safety**: TypeScript interfaces for User, Session, ApiResponse
- **Data enrichment**: Backend adds computed fields (role, timestamps)

## Error Recovery Flows

### Session Expired

1. Redis returns expired session
2. Frontend cleans up session data
3. Browser redirected to login

### Rate Limited

1. Backend returns 429 with Retry-After
2. Frontend caches retry window
3. UI shows user-friendly message with countdown

### Network Failure

1. TanStack Query retries with exponential backoff
2. Fallback to cached data if available
3. Error boundary catches unrecoverable errors

## Performance Optimizations

- **Query deduplication**: TanStack Query prevents duplicate requests
- **Background refetching**: Stale data served while fetching fresh
- **Efficient Redis operations**: Using SMEMBERS instead of KEYS
- **Response compression**: Gzip/Brotli for API responses
- **Selective field fetching**: Only required user fields queried

## Monitoring Points

- Session validation success/failure rates
- Cache hit/miss ratios
- API response times (P50, P95, P99)
- Rate limit violations per user
- Database query performance
