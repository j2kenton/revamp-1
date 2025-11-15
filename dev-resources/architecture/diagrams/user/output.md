# User Authentication Flow Diagram

Based on the AI-Powered Chat Application architecture, this diagram maps the complete user authentication flow using MSAL integration with Redis session management and CSRF protection.

## Authentication Flow

```mermaid
graph TD
    Start([User visits the site]) --> CheckSession{Is session valid?}
    
    CheckSession -->|Yes| ValidateCSRF{CSRF token valid?}
    CheckSession -->|No| ShowLogin[Show login/signup page]
    
    ValidateCSRF -->|Yes| Dashboard[User is on the main Dashboard]
    ValidateCSRF -->|No| RefreshSession[Rotate session & CSRF token]
    RefreshSession --> Dashboard
    
    ShowLogin --> UserChoice{New or existing user?}
    
    UserChoice -->|New user| SignupFlow[Start MSAL signup flow]
    UserChoice -->|Existing user| LoginChoice{Login method?}
    
    LoginChoice -->|Regular login| MSALLogin[MSAL authentication]
    LoginChoice -->|Forgot password?| ForgotPassword[MSAL password reset]
    
    SignupFlow --> MSALRedirect1[Redirect to Microsoft login]
    MSALLogin --> MSALRedirect2[Redirect to Microsoft login]
    ForgotPassword --> MSALReset[Microsoft password reset flow]
    
    MSALRedirect1 --> MSAuth{Microsoft authentication}
    MSALRedirect2 --> MSAuth
    MSALReset --> MSAuth
    
    MSAuth -->|Success| TokenValidation[Validate MSAL token]
    MSAuth -->|Failed| AuthError[Show authentication error]
    
    AuthError --> RetryChoice{Retry?}
    RetryChoice -->|Yes| ShowLogin
    RetryChoice -->|No| End([End session])
    
    TokenValidation --> RateLimit{Rate limit check}
    
    RateLimit -->|Passed| CreateSession[Create Redis session]
    RateLimit -->|Failed| RateLimitError[Show rate limit error]
    
    RateLimitError --> WaitPeriod[Wait for retry window]
    WaitPeriod --> ShowLogin
    
    CreateSession --> GenerateTokens[Generate session ID & CSRF token]
    GenerateTokens --> StoreSession[Store in Redis with TTL]
    StoreSession --> SetCookies[Set secure HTTP-only cookies]
    SetCookies --> IndexSession[Add to user session index]
    IndexSession --> Dashboard
    
    Dashboard --> SessionMonitor{Monitor session activity}
    SessionMonitor -->|Active| RefreshTTL[Refresh session TTL]
    SessionMonitor -->|Idle timeout| SessionExpired[Session expired]
    SessionMonitor -->|Logout| Logout[User logout]
    
    RefreshTTL --> Dashboard
    SessionExpired --> ClearSession[Clear Redis session]
    Logout --> ClearSession
    
    ClearSession --> RemoveIndex[Remove from user index]
    RemoveIndex --> ClearCookies[Clear cookies]
    ClearCookies --> ShowLogin
    
    style Start fill:#e1f5e1
    style Dashboard fill:#e1f5e1
    style AuthError fill:#ffe1e1
    style RateLimitError fill:#ffe1e1
    style End fill:#f5f5f5
```

## Key Security Features Highlighted

### Session Management

- **Redis Storage**: Server-side session storage with per-user indexing
- **Session Rotation**: Automatic rotation on privilege changes
- **TTL Management**: 7-day expiry with activity-based refresh

### CSRF Protection

- **Token Generation**: Secure random token per session
- **Double-Submit Pattern**: Token validation on state-changing requests
- **Automatic Rotation**: New tokens on session rotation

### Rate Limiting

- **Per-User Limits**: Sliding window counters in Redis
- **IP-Based Fallback**: Additional protection for unauthenticated requests
- **Configurable Thresholds**: 10 requests/minute for chat endpoints

### Cookie Security

- **HttpOnly**: Prevents JavaScript access
- **Secure**: HTTPS-only transmission
- **SameSite**: CSRF mitigation
- **Domain Scoping**: Restricted to application domain

## Error Recovery Paths

1. **Authentication Failure**
   - Clear error messaging
   - Retry option with rate limiting
   - Fallback to password reset

2. **Session Expiry**
   - Graceful degradation
   - Automatic cleanup
   - Re-authentication prompt

3. **Rate Limit Exceeded**
   - Informative error with retry window
   - Exponential backoff guidance
   - Alternative action suggestions

## Integration Points

- **MSAL**: Microsoft identity platform integration
- **Redis**: Session and rate limit storage
- **Next.js Middleware**: Request interception and validation
- **API Routes**: Protected endpoints with session validation

## Monitoring Touchpoints

- Session creation/deletion events
- Authentication success/failure rates
- Rate limit violations
- CSRF token validation failures
- Session activity patterns
