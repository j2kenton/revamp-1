# 🔒 Security Vulnerability Audit Report

**Date:** 2025-11-25  
**Auditor:** White Hat Security Analysis  
**Scope:** Full codebase security review  
**Severity Levels:** Critical, High, Medium, Low

---

## Executive Summary

After a comprehensive security audit of the codebase, **18 vulnerabilities**
were identified across multiple severity levels:

| Severity     | Count |
| ------------ | ----- |
| 🔴 Critical  | 3     |
| 🟠 High      | 5     |
| 🟡 Medium    | 6     |
| 🟢 Low       | 4     |

---

## 🔴 CRITICAL VULNERABILITIES (3)

### CRIT-01: Hardcoded Demo Credentials in NextAuth

**File:** `app/api/auth/[...nextauth]/route.ts` (lines 35-43)

**Vulnerable Code:**

```typescript
if (
  credentials.email === "demo@example.com" &&
  credentials.password === "password"
) {
  return { id: "1", email: credentials.email, name: "Demo User" };
}
```

**Risk:** Anyone can authenticate with these hardcoded credentials in
production. This provides unauthorized access to the application with a
known user ID.

**CVSS Score:** 9.8 (Critical)

**Remediation:**

1. Remove demo credentials entirely
2. If needed for testing, gate behind strict environment checks:

```typescript
if (
  process.env.NODE_ENV === "development" &&
  process.env.ENABLE_DEMO_USER === "true"
) {
  // Demo user logic (never in production)
}
```

---

### CRIT-02: Auth Bypass via Environment Variables and Headers

**Files:**

- `lib/auth/bypass.ts`
- `server/utils/test-auth.ts`
- `server/middleware/csrf.ts`
- `server/middleware/session.ts`

**Multiple bypass mechanisms exist:**

1. **Environment Variables:**
   - `BYPASS_AUTH=true` bypasses all authentication
   - `TEST_AUTH_MODE=true` enables test auth
   - `NEXT_PUBLIC_BYPASS_AUTH=true` (client-exposed!)
   - `NEXT_PUBLIC_TEST_AUTH_MODE=true` (client-exposed!)

2. **Request Headers/Cookies:**
   - Cookie `test-auth-bypass=enabled` bypasses auth
   - Header `x-test-auth-bypass: true` bypasses auth

**Critical Issue in `server/middleware/csrf.ts`:**

```typescript
if (process.env.BYPASS_AUTH === "true" || isTestAuthRequest(request)) {
  return { valid: true }; // CSRF completely bypassed!
}
```

**Risk:**

- If these env vars are accidentally set in production, complete auth
  bypass occurs
- Attackers who can forge cookies/headers can bypass authentication
- `NEXT_PUBLIC_*` variables are bundled into client JavaScript,
  revealing bypass status

**CVSS Score:** 9.1 (Critical)

**Remediation:**

1. Remove `NEXT_PUBLIC_` prefix from all bypass flags
2. Add mandatory production checks:

    ```typescript
    if (process.env.NODE_ENV === "production") {
      // Never allow bypass in production
      return false;
    }
    ```

3. Require cryptographically signed bypass tokens instead of simple
   headers

---

### CRIT-03: Client-Exposed Authentication Bypass Configuration

**File:** `next.config.ts`

**Vulnerable Code:**

```typescript
env: {
  NEXT_PUBLIC_BYPASS_AUTH:
    process.env.NEXT_PUBLIC_BYPASS_AUTH ??
    process.env.BYPASS_AUTH ??
    '',
  NEXT_PUBLIC_TEST_AUTH_MODE:
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE ??
    process.env.TEST_AUTH_MODE ??
    '',
  // ...
}
```

**Risk:**

- `NEXT_PUBLIC_*` variables are bundled into client-side JavaScript
- Attackers can inspect bundled code to see if bypass is enabled
- Information disclosure enables targeted attacks

**CVSS Score:** 8.5 (Critical)

**Remediation:**

1. Never expose auth bypass configuration to the client
2. Use server-only environment variables for security-sensitive flags
3. Remove fallback from server-only `BYPASS_AUTH` to client-visible var

---

## 🟠 HIGH SEVERITY (5)

### HIGH-01: IDOR Vulnerability with Information Disclosure

**File:** `app/api/chat/[chatId]/route.ts`

**Vulnerable Code:**

```typescript
const { chatId } = await context.params;
const chat = await getChat(chatId);

if (!chat) {
  return notFound("Chat not found");
}

if (chat.userId !== session.userId) {
  return unauthorized("You do not have access to this chat");
}
```

**Risk:**

- Different error messages reveal whether a chat exists vs. user lacks
  access
- Attackers can enumerate valid chat IDs by observing response
  differences
- Chat IDs are based on timestamp + random, making them somewhat
  predictable

**CVSS Score:** 7.5 (High)

**Remediation:**

Return same error for both cases:

```typescript
if (!chat || chat.userId !== session.userId) {
  return notFound("Chat not found");
}
```

---

### HIGH-02: Insufficient XSS Sanitization

**File:** `lib/sanitizer.ts`

**Vulnerable Code:**

```typescript
const TAG_REGEX = /<[^>]*>/g;
const SCRIPT_REGEX = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;

export function sanitizeHtml(dirty: string): string {
  const withoutScripts = dirty.replace(SCRIPT_REGEX, "");
  const withoutTags = withoutScripts.replace(TAG_REGEX, "");
  return escapeSpecialChars(withoutTags);
}
```

**Bypass Examples:**

```html
<!-- Encoded entities (decoded after sanitization) -->
&lt;script&gt;alert(1)&lt;/script&gt;

<!-- Event handlers not blocked -->
<img src="x" onerror="alert(1)" />

<!-- SVG vectors -->
<svg onload="alert(1)"></svg>

<!-- javascript: URLs -->
<a href="javascript:alert(1)">click</a>

<!-- Malformed HTML -->
<scr<script>ipt>alert(1)</script>
```

**Risk:** XSS attacks can steal session tokens, perform actions as
users, or redirect to phishing sites.

**CVSS Score:** 8.0 (High)

**Remediation:**

Use a battle-tested library:

```typescript
import DOMPurify from "isomorphic-dompurify";

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [], // Strip all HTML for plain text
    ALLOWED_ATTR: [],
  });
}
```

---

### HIGH-03: Rate Limiter Fails Open

**File:** `lib/rate-limiter.ts` (lines 74-82)

**Vulnerable Code:**

```typescript
} catch (error) {
  // On Redis failure, fail open (allow request) but log the error
  logError('Rate limiter error', error, { key, identifier });

  return {
    allowed: true, // ⚠️ Always allows requests when Redis fails!
    limit: maxRequests,
    remaining: maxRequests,
    resetAt: new Date(now + windowSeconds * MILLISECONDS_PER_SECOND),
  };
}
```

**Risk:**

- If Redis is down or misconfigured, all rate limiting is disabled
- Enables brute force attacks against authentication
- Allows DoS by overwhelming API endpoints
- Attackers could intentionally disrupt Redis to disable rate limiting

**CVSS Score:** 7.8 (High)

**Remediation:**

1. Implement in-memory fallback rate limiter
2. Fail closed for critical endpoints (auth, chat):

```typescript
} catch (error) {
  logError('Rate limiter error', error);

  if (config.keyPrefix?.includes('auth')) {
    // Fail closed for auth endpoints
    return { allowed: false, ... };
  }

  // Use in-memory fallback for others
  return inMemoryRateLimiter(identifier, config);
}
```

---

### HIGH-04: Missing NEXTAUTH_SECRET in Non-Production

**File:** `app/api/auth/[...nextauth]/route.ts`

**Vulnerable Code:**

```typescript
const nextAuthSecret = process.env.NEXTAUTH_SECRET;

if (!nextAuthSecret && process.env.NODE_ENV === "production") {
  throw new Error(
    "NEXTAUTH_SECRET environment variable must be set in production."
  );
}
```

**Risk:**

- In development/staging without a secret, JWTs may be signed with a
  weak/default key
- Tokens from non-production could be valid if secret is same or weak
- Session hijacking possible between environments

**CVSS Score:** 7.2 (High)

**Remediation:**

Require secret in all environments:

```typescript
if (!nextAuthSecret) {
  throw new Error("NEXTAUTH_SECRET environment variable must be set.");
}
```

---

### HIGH-05: Sensitive Data in Logs

**File:** `utils/logger.ts`

**Vulnerable Code:**

```typescript
function formatMessage(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}
```

**Risk:**

- Access tokens, refresh tokens may be logged
- User emails and IP addresses logged without masking
- Session IDs exposed in error contexts
- Log aggregation services may store sensitive data

**Example from codebase:**

```typescript
logError("MSAL authentication error", error);
logInfo("LLM request completed", { chatId, userId /* ... */ });
```

**CVSS Score:** 6.5 (High)

**Remediation:**

Implement sensitive data masking:

```typescript
const SENSITIVE_KEYS = [
  "token",
  "password",
  "secret",
  "email",
  "authorization",
];

function maskSensitiveData(
  obj: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
        return [key, "[REDACTED]"];
      }
      return [key, value];
    })
  );
}
```

---

## 🟡 MEDIUM SEVERITY (6)

### MED-01: CSRF Token Derived from Access Token

**File:** `lib/auth/csrf.ts`

**Vulnerable Code:**

```typescript
export async function deriveCsrfToken(
  accessToken: string | null
): Promise<string | null> {
  if (!accessToken) return null;

  const encoder = new TextEncoder();
  const data = encoder.encode(accessToken);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
}
```

**Risk:**

- CSRF token is deterministic based on access token
- If access token leaks (via logs, XSS, referrer), CSRF protection is
  compromised
- No server-side CSRF token storage for validation

**CVSS Score:** 6.1 (Medium)

**Remediation:**

Use cryptographically random CSRF tokens stored server-side:

```typescript
import { randomBytes } from "crypto";

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}
// Store in session and validate on server
```

---

### MED-02: Missing Input Validation on Todo/User APIs

**Files:**

- `app/api/todos/route.ts`
- `app/api/todos/[todoId]/route.ts`
- `app/api/users/[userId]/route.ts`

**Issues:**

1. Todo PATCH accepts any body fields without schema validation
2. User GET endpoint has no authentication requirement (public endpoint)
3. No Zod schema validation like chat endpoints have
4. No input length limits

**Risk:**

- Mass assignment vulnerabilities
- Information disclosure via user endpoint
- Potential NoSQL injection if data reaches database

**CVSS Score:** 5.3 (Medium)

**Remediation:**

Add Zod schemas and auth requirements:

```typescript
const updateTodoSchema = z.object({
  title: z.string().max(200).optional(),
  completed: z.boolean().optional(),
});

export const PATCH = requireAuth(
  requireCsrfToken(async (request, context) => {
    const validation = updateTodoSchema.safeParse(await request.json());
    if (!validation.success) return badRequest(/* ... */);
    // ...
  })
);
```

---

### MED-03: Insecure Session Cookie in Development

**File:** `server/middleware/session.ts`

**Vulnerable Code:**

```typescript
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // false in development!
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
```

**Risk:**

- Session cookies sent over HTTP in development
- Could be intercepted on shared networks (coffee shops, offices)
- Developer sessions could be hijacked

**CVSS Score:** 4.8 (Medium)

**Remediation:**

Consider always using secure cookies with localhost exception:

```typescript
secure:
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(
    request.headers.get("host")?.split(":")[0] ?? ""
  );
```

---

### MED-04: Missing Origin Validation for SSE Stream

**File:** `app/api/chat/stream/route.ts`

No CORS or origin validation for Server-Sent Events endpoint. The
endpoint validates CSRF but doesn't check the request origin.

**Risk:**

- Cross-origin requests could establish streaming connections
- Potential for cross-site data exfiltration if CSRF is bypassed

**CVSS Score:** 5.0 (Medium)

**Remediation:**

Add origin validation:

```typescript
const origin = request.headers.get("origin");
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
if (origin && !allowedOrigins.includes(origin)) {
  return forbidden("Invalid origin");
}
```

---

### MED-05: Dangerous Pattern with dangerouslySetInnerHTML

**File:** `components/test-auth-bypass/TestAuthBypass.tsx`

**Code:**

```typescript
<script
  dangerouslySetInnerHTML={{
    __html: 'window.__BYPASS_AUTH__ = true;',
  }}
/>
```

**Risk:**

- While content is currently static, this pattern is concerning
- Sets a precedent that could lead to XSS if dynamic content is added
- Exposes bypass flag to client-side inspection

**CVSS Score:** 4.3 (Medium)

**Remediation:**

Avoid dangerouslySetInnerHTML entirely:

```typescript
// In a useEffect hook instead
useEffect(() => {
  if (isEnabled && process.env.NODE_ENV !== "production") {
    (window as any).__BYPASS_AUTH__ = true;
  }
}, [isEnabled]);
```

---

### MED-06: Redis TLS Validation Disabled in Development

**File:** `lib/redis/client.ts`

**Vulnerable Code:**

```typescript
...(config.tls && {
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
  },
}),
```

**Risk:**

- Man-in-the-middle attacks on Redis connections in non-production
- Could intercept session data, rate limit state
- Development/staging environments often have production-like data

**CVSS Score:** 5.3 (Medium)

**Remediation:**

Enable TLS validation in all environments, or use dedicated
development Redis:

```typescript
tls: {
  rejectUnauthorized: true, // Always validate
}
```

---

## 🟢 LOW SEVERITY (4)

### LOW-01: Verbose Error Messages in Non-Production

**File:** `utils/error-handler.ts`

**Code:**

```typescript
message:
  process.env.NODE_ENV === "production"
    ? "An unexpected error occurred"
    : error.message;
```

**Risk:** Stack traces and error details could reveal implementation
information in staging environments.

**CVSS Score:** 3.1 (Low)

---

### LOW-02: Missing Content Security Policy

No CSP headers are set anywhere in the application.

**Risk:**

- XSS impact is amplified without CSP
- Inline scripts could execute
- External resources could be loaded

**Remediation:**

Add CSP via Next.js middleware:

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline';"
  );
  return response;
}
```

---

### LOW-03: Missing HTTP Security Headers

Missing headers:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (HSTS)
- `X-XSS-Protection: 1; mode=block`

**Risk:** Clickjacking, MIME sniffing attacks, downgrade attacks.

---

### LOW-04: Predictable Message/Chat IDs

**File:** `app/api/chat/route.ts`

**Code:**

```typescript
const userMessageId = `msg_${Date.now()}_${Math.random()
  .toString(RANDOM_STRING_BASE)
  .slice(RANDOM_STRING_SLICE_START)}`;
```

**Risk:**

- `Math.random()` is not cryptographically secure
- Timestamp portion is predictable
- Could enable ID guessing attacks

**Remediation:**

```typescript
import { randomUUID } from "crypto";
const userMessageId = `msg_${randomUUID()}`;
```

---

## 📋 Remediation Priority Matrix

### Immediate (This Week) - Critical

- [ ] Remove hardcoded demo credentials (CRIT-01)
- [ ] Remove `NEXT_PUBLIC_BYPASS_AUTH` and `NEXT_PUBLIC_TEST_AUTH_MODE`
      (CRIT-02, CRIT-03)
- [ ] Add mandatory production checks to ALL bypass mechanisms

### Short-term (Next 2 Weeks) - High

- [ ] Replace custom sanitizer with DOMPurify (HIGH-02)
- [ ] Implement rate limiter fallback/fail-closed strategy (HIGH-03)
- [ ] Require NEXTAUTH_SECRET in all environments (HIGH-04)
- [ ] Implement sensitive data masking in logs (HIGH-05)
- [ ] Fix IDOR information disclosure (HIGH-01)

### Medium-term (Next Month) - Medium

- [ ] Add CSP headers via Next.js middleware (LOW-02)
- [ ] Implement proper random CSRF tokens (MED-01)
- [ ] Add input validation to all API endpoints (MED-02)
- [ ] Add origin validation to SSE endpoint (MED-04)
- [ ] Add HTTP security headers (LOW-03)

### Long-term (Ongoing)

- [ ] Security testing automation (DAST/SAST)
- [ ] Regular dependency audits (`npm audit`)
- [ ] Penetration testing
- [ ] Security training for developers

---

## Appendix A: Files Reviewed

### Authentication

- `lib/auth/bypass.ts`
- `lib/auth/csrf.ts`
- `lib/auth/useAuth.ts`
- `lib/auth/tokenStorage.ts`
- `lib/auth/msalConfig.ts`

### API Routes

- `app/api/chat/route.ts`
- `app/api/chat/stream/route.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `app/api/todos/route.ts`
- `app/api/users/[userId]/route.ts`

### Middleware

- `server/middleware/session.ts`
- `server/middleware/csrf.ts`
- `server/middleware/msal-auth.ts`
- `server/middleware/rate-limit.ts`

### Security Utils

- `lib/sanitizer.ts`
- `lib/rate-limiter.ts`
- `utils/error-handler.ts`
- `utils/logger.ts`

### Configuration

- `next.config.ts`
- `app/layout.tsx`

### Data Layer

- `lib/redis/client.ts`
- `lib/redis/chat.ts`
- `lib/redis/session.ts`

### Test Support

- `server/utils/test-auth.ts`
- `app/api/test-support/auth/route.ts`
- `components/test-auth-bypass/TestAuthBypass.tsx`

---

## Appendix B: Additional Technical Details

### Test Authentication Bypass Flow (CRIT-02)

The test auth bypass can be triggered via multiple vectors:

#### Vector 1: Environment Variable

```bash
# If set in production, bypasses ALL authentication
BYPASS_AUTH=true
```

#### Vector 2: Cookie-based bypass

```http
Cookie: test-auth-bypass=enabled
```

Defined in `lib/constants/test-auth.ts`:

```typescript
export const TEST_AUTH_COOKIE_NAME = "test-auth-bypass";
export const TEST_AUTH_COOKIE_VALUE = "enabled";
```

#### Vector 3: Header-based bypass

```http
x-test-auth-bypass: true
```

Defined in `lib/constants/test-auth.ts`:

```typescript
export const TEST_AUTH_HEADER_NAME = "x-test-auth-bypass";
```

#### Vector 4: localStorage (client-side)

```javascript
localStorage.setItem("test-auth-bypass", "true");
```

#### Attack Chain

1. Attacker sets `x-test-auth-bypass: true` header on any request
2. If `TEST_AUTH_MODE=true` is set (even accidentally),
   `isTestAuthRequest()` returns `true`
3. `shouldBypassAuth()` in `server/utils/test-auth.ts` returns `true`
4. All session checks return bypass session with userId `bypass-user`
5. CSRF protection is also bypassed
6. Full authenticated access achieved

---

### URL Sanitization Gap (HIGH-02 Related)

**File:** `lib/sanitizer.ts`

The `sanitizeUrl` function only allows `http:`, `https:`, and `mailto:`
protocols but doesn't handle:

```typescript
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const allowedProtocols = ["http:", "https:", "mailto:"];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
```

**Missing protections for:**

- Data URLs: `data:text/html,<script>alert(1)</script>`
- Blob URLs in certain contexts
- URL manipulation via unicode characters

---

### Session Bypass Returns Predictable Data (CRIT-02 Detail)

**File:** `server/middleware/session.ts` (lines 37-53)

When bypass is enabled, a predictable session is returned:

```typescript
function createBypassSession(request: NextRequest): SessionModel {
  return {
    id: "jwt-fallback:bypass-user", // ⚠️ Predictable ID
    userId: "bypass-user", // ⚠️ Predictable user ID
    csrfToken: "bypass-csrf-token", // ⚠️ Predictable CSRF token
    data: {
      email: "test-user@example.com", // ⚠️ Predictable email
      name: "Test User",
      source: "bypass-auth",
    },
    // ...
  };
}
```

This means if bypass is enabled, ALL users share the same session and
can see each other's data if the application uses userId for
authorization.

---

### MSAL Token Validation Edge Case

**File:** `server/middleware/msal-auth.ts`

The code validates tokens but has a configuration warning that could
be missed:

```typescript
if (TENANT_ID === "common") {
  logWarn(
    'MSAL configuration warning: TENANT_ID is set to "common". ' +
      "This is not valid for JWKS validation..."
  );
}
```

**Issue:** The warning is logged but execution continues. If
`TENANT_ID` is `common`, token validation may fail silently or accept
tokens from any Azure AD tenant, potentially allowing cross-tenant
access.

---

### Redis Key Prefix Collision Risk

**File:** `lib/redis/keys.ts` (referenced in multiple files)

Keys use predictable prefixes:

```typescript
// From various files
const key = `${keyPrefix}:${identifier}`;
const key = `idempotency:${session.userId}:${idempotencyKey}`;
const key = `ratelimit:zset:chat`;
```

**Risk:** If Redis is shared across environments or applications, key
collisions could occur. No namespace isolation is enforced.

---

### HTTP Client Missing Security Headers

**File:** `lib/http/client.ts`

The HTTP client wrapper doesn't add security headers to outgoing
requests:

```typescript
export async function post<T>(
  url: string,
  body?: unknown,
  options?: FetchOptions
): Promise<ApiResponse<T>> {
  return fetchWithTimeout<T>(url, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
      // Missing: User-Agent, no SSRF protection
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
```

**Risk:**

- No SSRF protection (could fetch internal resources)
- No URL validation before fetching
- Could be used to scan internal network if user-controlled URLs are
  passed

---

### Web Vitals Endpoint IP Spoofing (MED-02 Related)

**File:** `app/api/analytics/web-vitals/route.ts`

The IP is taken from headers without validation:

```typescript
const ip =
  request.headers.get("x-forwarded-for")?.split(",")[0] ||
  request.headers.get("x-real-ip") ||
  "unknown";
```

**Risk:** Attackers can spoof their IP by setting `X-Forwarded-For`
header, potentially bypassing IP-based rate limiting.

---

## Appendix C: Exact Line Numbers for Critical Fixes

### CRIT-01

- **File:** `app/api/auth/[...nextauth]/route.ts`
- **Lines:** 35-43
- **Action:** Remove entire if block

### CRIT-02 (Multiple locations)

- **File:** `server/middleware/csrf.ts`
- **Lines:** 27-29
- **Action:** Add production check

---

- **File:** `server/utils/test-auth.ts`
- **Lines:** 24-26
- **Action:** Add production check

---

- **File:** `lib/auth/bypass.ts`
- **Lines:** 22-28, 45-52
- **Action:** Strengthen production guards

### CRIT-03

- **File:** `next.config.ts`
- **Lines:** 8-11
- **Action:** Remove NEXT_PUBLIC bypass vars

### HIGH-01

- **File:** `app/api/chat/[chatId]/route.ts`
- **Lines:** 45-53
- **Action:** Combine conditions

### HIGH-02

- **File:** `lib/sanitizer.ts`
- **Lines:** 6-20
- **Action:** Replace with DOMPurify

### HIGH-03

- **File:** `lib/rate-limiter.ts`
- **Lines:** 74-82
- **Action:** Add fallback logic

### HIGH-04

- **File:** `app/api/auth/[...nextauth]/route.ts`
- **Lines:** 9-12
- **Action:** Remove NODE_ENV check

### HIGH-05

- **File:** `utils/logger.ts`
- **Lines:** 36-42
- **Action:** Add masking function

---

## Appendix D: Testing Recommendations

### For CRIT-01 (Demo Credentials)

```bash
# Test that demo credentials are rejected
curl -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"password"}'
# Expected: 401 Unauthorized
```

### For CRIT-02 (Auth Bypass)

```bash
# Test that bypass header is rejected in production
NODE_ENV=production curl http://localhost:3000/api/chat \
  -H "x-test-auth-bypass: true"
# Expected: 401 Unauthorized

# Test that bypass cookie is rejected
curl http://localhost:3000/api/chat \
  -H "Cookie: test-auth-bypass=enabled"
# Expected: 401 Unauthorized (unless TEST_AUTH_MODE=true)
```

### For HIGH-01 (IDOR)

```bash
# Access another user's chat - should return same error as non-existent
curl http://localhost:3000/api/chat/chat_12345_abc \
  -H "Authorization: Bearer <token>"
# Expected: 404 "Chat not found" (not 401)
```

### For HIGH-02 (XSS)

```javascript
// Test sanitizer with bypass vectors
const vectors = [
  '<img src=x onerror=alert(1)>',
  "<svg onload=alert(1)>",
  "&lt;script&gt;alert(1)&lt;/script&gt;",
  '<a href="javascript:alert(1)">test</a>',
];
vectors.forEach((v) => {
  const result = sanitizeHtml(v);
  console.assert(!result.includes("onerror"), `Failed: ${v}`);
  console.assert(!result.includes("onload"), `Failed: ${v}`);
  console.assert(!result.includes("javascript:"), `Failed: ${v}`);
});
```

---

*Report generated by automated security analysis. Manual verification
of findings is recommended.*
