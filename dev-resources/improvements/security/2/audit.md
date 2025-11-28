# 🔒 Security Vulnerability Audit Report - Rate Limiting & LLM Cost Bypass

**Date:** 2025-11-28  
**Auditor:** White Hat Security Analysis  
**Scope:** Rate limiting and LLM API cost protection  
**Focus:** Vulnerabilities that could cause financial damage through excessive LLM calls  
**Severity Levels:** Critical, High, Medium, Low

---

## How to Use This Document (For AI Agents)

This security audit document is designed to be machine-readable and actionable. When implementing fixes:

1. **Start with CRIT-01, CRIT-02, CRIT-03** - These are the most severe and should be fixed first
2. **Each vulnerability has**: File path, line numbers, vulnerable code, attack vector, and complete remediation code
3. **Dependencies**: CRIT-01 and CRIT-02 should be fixed together (same pattern). HIGH-01 depends on understanding the rate limiting flow first.
4. **Test cases are provided** in Appendix B - use these to verify fixes work correctly
5. **Cross-references**: Some vulnerabilities are related:
   - CRIT-01 + CRIT-02 + MED-03 all relate to Redis failure handling
   - HIGH-01 + MED-01 both relate to identifier extraction
   - HIGH-02 + HIGH-03 both relate to rate limit configuration

### Quick Reference - Vulnerability IDs

| ID | File | Issue | Fix Complexity |
|----|------|-------|----------------|
| CRIT-01 | `server/middleware/rate-limit.ts:57-63` | Fail-open on Redis error | Simple (change return value) |
| CRIT-02 | `server/middleware/enhanced-rate-limit.ts:157-163` | Fail-open on Redis error | Simple (change return value) |
| CRIT-03 | `server/middleware/rate-limit.ts:42-44` | Rate limit disable flag | Simple (add production check) |
| HIGH-01 | `server/middleware/rate-limit.ts:34-42` | IP spoofing via X-Forwarded-For | Medium (add proxy validation) |
| HIGH-02 | `server/middleware/rate-limit.ts:94-114` | Duplicate rate limiters | Medium (consolidate middleware) |
| HIGH-03 | `app/api/chat/route.ts` + `app/api/chat/stream/route.ts` | No global LLM rate limit | Medium (add shared limiter) |
| MED-01 | `server/middleware/rate-limit.ts` | User/IP rate limit switching | Medium (track both identifiers) |
| MED-02 | `app/api/chat/route.ts:47-57,138-147` | Idempotency race condition | Medium (use SETNX before LLM) |
| MED-03 | `lib/llm/service.ts` + `lib/redis/circuit-breaker.ts` | Circuit breaker inconsistency | Medium (link circuit breakers) |
| LOW-01 | `lib/rate-limiter.ts:14-21` | In-memory not shared | Low priority |
| LOW-02 | `server/middleware/request-dedup.ts:42-47` | Dedup header bypass | Low priority |

---

## Executive Summary

After a focused security audit on rate limiting mechanisms and LLM cost protection, **11 vulnerabilities** were identified that could allow attackers to bypass rate limiting and cause significant financial damage through excessive API calls:

| Severity     | Count |
| ------------ | ----- |
| 🔴 Critical  | 3     |
| 🟠 High      | 3     |
| 🟡 Medium    | 3     |
| 🟢 Low       | 2     |

**Estimated Financial Impact:** Without fixes, an attacker could potentially make unlimited LLM API calls, resulting in thousands of dollars in API costs within minutes.

---

## 🔴 CRITICAL VULNERABILITIES (3)

### CRIT-01: Fail-Open on Redis Errors (Rate Limiting Middleware)

**File:** `server/middleware/rate-limit.ts` (lines 57-63)

**Vulnerable Code:**

```typescript
} catch (error) {
  // On error, fail open (allow request) but log
  logWarn('Rate limit check failed', { error });
  return { allowed: true };
}
```

**Risk:** If Redis becomes unavailable due to DDoS, network issues, or intentional disruption, ALL rate limiting is bypassed, allowing unlimited LLM calls.

**Attack Vector:**

1. Attacker floods Redis with connections until it becomes unresponsive
2. All subsequent requests bypass rate limiting due to fail-open behavior
3. Unlimited LLM API calls = unlimited costs

**CVSS Score:** 9.5 (Critical)

**Financial Impact:** Unlimited API costs - potentially thousands of dollars per hour

**Remediation:**

```typescript
} catch (error) {
  // SECURITY FIX: Fail CLOSED on rate limit errors
  logError('Rate limit check failed - failing closed for security', error);
  return {
    allowed: false,
    error: serviceUnavailable('Rate limiting service temporarily unavailable. Please try again.'),
  };
}
```

---

### CRIT-02: Fail-Open on Redis Errors (Enhanced Rate Limiting)

**File:** `server/middleware/enhanced-rate-limit.ts` (lines 157-163)

**Vulnerable Code:**

```typescript
} catch (error) {
  logError('Rate limiting error', error, { identifier, endpoint });

  // Fail open: allow request if rate limiting fails
  return { allowed: true };
}
```

**Risk:** Same as CRIT-01 - Redis failure bypasses enhanced rate limiting completely.

**CVSS Score:** 9.5 (Critical)

**Remediation:** Same pattern as CRIT-01 - fail closed instead of open.

---

### CRIT-03: Environment Variable to Disable Rate Limiting

**File:** `server/middleware/rate-limit.ts` (lines 42-44)

**Vulnerable Code:**

```typescript
if (process.env.ENABLE_RATE_LIMITING === 'false') {
  return { allowed: true };
}
```

**Risk:** If `ENABLE_RATE_LIMITING=false` is set (misconfiguration, insider attack, or environment variable injection), rate limiting is completely disabled.

**Critical Issues:**

- No runtime validation that this is NEVER set in production
- No logging when rate limiting is disabled
- No additional safeguards

**CVSS Score:** 9.0 (Critical)

**Remediation:**

```typescript
// SECURITY: Add mandatory production check
if (process.env.ENABLE_RATE_LIMITING === 'false') {
  if (process.env.NODE_ENV === 'production') {
    logError('CRITICAL: Attempted to disable rate limiting in production - ignoring');
    // Fall through to normal rate limiting
  } else {
    logWarn('Rate limiting disabled via environment variable');
    return { allowed: true };
  }
}
```

---

## 🟠 HIGH SEVERITY (3)

### HIGH-01: IP-Based Rate Limiting Bypass via X-Forwarded-For Spoofing

**File:** `server/middleware/rate-limit.ts` (lines 34-42)

**Vulnerable Code:**

```typescript
function getRateLimitIdentifier(request: NextRequest, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }

  // Get IP from headers (works with proxies like Vercel)
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';

  return `ip:${ip}`;
}
```

**Risk:** Unauthenticated users can spoof the `X-Forwarded-For` header to bypass IP-based rate limiting entirely.

**Attack Vector:**

```bash
# Each request uses a different spoofed "IP" - bypasses rate limit completely
for i in {1..1000}; do
  curl -H "X-Forwarded-For: 192.168.1.$i" https://target.com/api/chat \
    -d '{"content":"expensive LLM request"}'
done
# Result: 1000 LLM calls instead of 10 allowed
```

**CVSS Score:** 8.5 (High)

**Financial Impact:** Multiplies effective rate limit by virtually unlimited factor

**Remediation:**

```typescript
function getRateLimitIdentifier(request: NextRequest, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }

  // SECURITY: Only trust X-Forwarded-For from known proxy IPs
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  // Get the connecting IP (closest proxy)
  const connectingIp = realIp || (forwarded ? forwarded.split(',').pop()?.trim() : null);
  
  // Validate against known proxy CIDR ranges
  const trustedProxies = process.env.TRUSTED_PROXY_IPS?.split(',') || [];
  
  let clientIp: string;
  if (trustedProxies.length > 0 && connectingIp && trustedProxies.includes(connectingIp)) {
    // Request came through trusted proxy, use first X-Forwarded-For value
    clientIp = forwarded?.split(',')[0]?.trim() || 'unknown';
  } else {
    // Not from trusted proxy, use connecting IP
    clientIp = connectingIp || 'unknown';
  }

  return `ip:${clientIp}`;
}
```

---

### HIGH-02: Duplicate Rate Limiting Creates Inconsistency

**File:** `server/middleware/rate-limit.ts` (lines 94-114)

**Vulnerable Code:**

```typescript
export function withChatRateLimit(
  handler: (request: NextRequest, context?: unknown) => Promise<Response>,
): (request: NextRequest, context?: unknown) => Promise<Response> {
  const limitedHandler = requireRateLimit(RATE_LIMITS.CHAT_MESSAGE, handler);

  return async (request: NextRequest, context?: unknown) => {
    // ...
    const { allowed, error } = await chatRateLimit(request, userId);

    if (!allowed && error) {
      return error;
    }

    return limitedHandler(request, context);  // Applies SECOND rate limiter
  };
}
```

**Problem:** Two separate rate limiters are applied:

1. `chatRateLimit()` - Enhanced rate limiting (20 req/min)
2. `requireRateLimit(RATE_LIMITS.CHAT_MESSAGE)` - Basic rate limiting (10 req/min)

**Attack Vector:**

- Attacker can exhaust one rate limiter while staying under the other
- Different Redis keys and configurations create confusion
- Total allowed requests may exceed what either limiter alone would allow

**CVSS Score:** 7.0 (High)

**Remediation:** Consolidate into a single rate limiter:

```typescript
export function withChatRateLimit(
  handler: (request: NextRequest, context?: unknown) => Promise<Response>,
): (request: NextRequest, context?: unknown) => Promise<Response> {
  return async (request: NextRequest, context?: unknown) => {
    const session = await getSessionFromRequest(request);
    const userId = session?.userId ?? null;

    // Single rate limit check (not duplicated)
    const { allowed, error } = await chatRateLimit(request, userId);

    if (!allowed && error) {
      return error;
    }

    return handler(request, context);
  };
}
```

---

### HIGH-03: No Global Rate Limit Across LLM Endpoints

**Files:**

- `app/api/chat/route.ts`
- `app/api/chat/stream/route.ts`

**Problem:** The chat API has TWO separate endpoints that call the LLM:

- `POST /api/chat` (non-streaming) - 10 requests/minute
- `POST /api/chat/stream` (streaming) - 20 requests/minute

Each has its own independent rate limit with different Redis keys.

**Attack Vector:**

```bash
# Use all of /api/chat rate limit
for i in {1..10}; do curl -X POST /api/chat -d '{"content":"test"}'; done

# Then use all of /api/chat/stream rate limit
for i in {1..20}; do curl -X POST /api/chat/stream -d '{"content":"test"}'; done

# Total: 30 LLM calls per minute instead of intended 10-20
```

**CVSS Score:** 7.5 (High)

**Financial Impact:** 50-200% more LLM calls than intended

**Remediation:**

Create a shared rate limiter for all LLM endpoints:

```typescript
// lib/rate-limiter.ts
export const RATE_LIMITS = {
  // ... existing limits
  LLM_GLOBAL: {
    maxRequests: 15,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:zset:llm-global',
  },
} as const;

// Apply to both /api/chat and /api/chat/stream
async function checkGlobalLLMRateLimit(request: NextRequest, userId: string | null) {
  const identifier = userId ? `user:${userId}` : `ip:${getClientIp(request)}`;
  return checkRateLimit(redis, identifier, RATE_LIMITS.LLM_GLOBAL);
}
```

---

## 🟡 MEDIUM SEVERITY (3)

### MED-01: Rate Limit Key Collision (User vs IP)

**File:** `server/middleware/rate-limit.ts`

**Vulnerable Code:**

```typescript
function getRateLimitIdentifier(request: NextRequest, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }
  // ...
  return `ip:${ip}`;
}
```

**Problem:** A user logging in/out can switch between user-based and IP-based rate limiting, effectively doubling their allowed requests.

**Attack Vector:**

1. Send 10 requests as authenticated user (exhausts user rate limit)
2. Clear session cookie (logout)
3. Send 10 more requests as unauthenticated (uses IP rate limit)
4. Re-authenticate and repeat

**CVSS Score:** 6.0 (Medium)

**Financial Impact:** 2x more LLM calls than intended

**Remediation:**

Track both identifiers in a single check:

```typescript
function getRateLimitIdentifiers(request: NextRequest, userId?: string): string[] {
  const identifiers: string[] = [];
  
  // Always track IP
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  identifiers.push(`ip:${ip}`);
  
  // Also track user if authenticated
  if (userId) {
    identifiers.push(`user:${userId}`);
  }
  
  return identifiers;
}

// Check ALL identifiers and deny if ANY is rate limited
async function checkAllRateLimits(identifiers: string[], config: RateLimitConfig) {
  for (const identifier of identifiers) {
    const result = await checkRateLimit(redis, identifier, config);
    if (!result.allowed) {
      return result;
    }
  }
  // Increment all counters
  for (const identifier of identifiers) {
    await incrementRateLimit(redis, identifier, config);
  }
  return { allowed: true };
}
```

---

### MED-02: Idempotency Key Race Condition Allows Duplicate LLM Costs

**File:** `app/api/chat/route.ts` (lines 47-57, 138-147)

**Vulnerable Code:**

```typescript
// Check idempotency (BEFORE LLM call)
if (idempotencyKey) {
  const existing = await redis.get(idempotencyKeyStore);
  if (existing) {
    return success(JSON.parse(existing), { message: 'Message already processed' });
  }
}

// ... LLM is called here ...

// Store idempotency key (AFTER LLM call)
if (idempotencyKey) {
  await txSet(ctx, idempotencyKeyStore, JSON.stringify(responseData), IDEMPOTENCY_KEY_TTL_SECONDS);
}
```

**Problem:** The idempotency key is stored AFTER the LLM call completes. This creates a race condition window.

**Attack Vector:**

1. Request A arrives with idempotency key X, checks Redis (not found)
2. Request B arrives with same idempotency key X (0.1ms later), checks Redis (still not found)
3. Both requests proceed to call LLM
4. Both LLM calls complete = double API costs
5. Only then is the idempotency key stored

**CVSS Score:** 5.5 (Medium)

**Financial Impact:** 2x-Nx LLM costs depending on request timing

**Remediation:**

Use Redis SETNX (atomic set-if-not-exists) BEFORE the LLM call:

```typescript
if (idempotencyKey) {
  const idempotencyLockKey = `idempotency:lock:${session.userId}:${idempotencyKey}`;
  
  // Atomic: only one request wins
  const acquired = await redis.setnx(idempotencyLockKey, 'processing');
  
  if (!acquired) {
    // Another request is processing or completed
    // Wait briefly and check for result
    await new Promise(resolve => setTimeout(resolve, 100));
    const existing = await redis.get(idempotencyKeyStore);
    if (existing) {
      return success(JSON.parse(existing), { message: 'Message already processed' });
    }
    return conflict('Request is being processed. Please wait.');
  }
  
  // Set lock expiration in case of crash
  await redis.expire(idempotencyLockKey, 60);
}

// ... proceed with LLM call ...

// Store result and release lock
if (idempotencyKey) {
  await redis.set(idempotencyKeyStore, JSON.stringify(responseData), 'EX', IDEMPOTENCY_KEY_TTL_SECONDS);
  await redis.del(idempotencyLockKey);
}
```

---

### MED-03: Circuit Breaker Inconsistency Between Services

**Files:**

- `lib/llm/service.ts` - LLM circuit breaker
- `lib/redis/circuit-breaker.ts` - Redis circuit breaker

**Problem:** There are TWO separate circuit breakers that operate independently:

| Circuit Breaker | Failure Threshold | Timeout |
|-----------------|-------------------|---------|
| LLM Service | 5 failures | 60 seconds |
| Redis | 5 failures | 30 seconds |

**Risk:** If the Redis circuit breaker opens but the LLM circuit breaker is closed, requests continue attempting LLM calls WITHOUT rate limiting protection.

**Attack Scenario:**

1. Attacker disrupts Redis (5 failures → Redis circuit opens)
2. Rate limiting falls back to in-memory (per-instance, not global)
3. LLM circuit breaker remains closed (LLM service is healthy)
4. Requests proceed to LLM without proper rate limiting
5. Each application instance has its own in-memory rate limit
6. With 5 instances, effective rate limit is 5x higher

**CVSS Score:** 5.0 (Medium)

**Remediation:**

Link the circuit breakers:

```typescript
// In rate-limit.ts
async function checkRateLimitWithCircuitBreaker(request: NextRequest, config: RateLimitConfig) {
  const redisCircuit = getRedisCircuitBreaker();
  
  if (redisCircuit.getState() === 'OPEN') {
    // Redis is down - deny all requests to prevent LLM abuse
    logError('Rate limiting unavailable - Redis circuit breaker open - denying request');
    return {
      allowed: false,
      error: serviceUnavailable('Service temporarily unavailable. Please try again in a few moments.'),
    };
  }
  
  // Proceed with normal rate limiting
  return withRateLimit(request, config);
}
```

---

## 🟢 LOW SEVERITY (2)

### LOW-01: In-Memory Rate Limiter Not Shared Across Instances

**File:** `lib/rate-limiter.ts` (lines 14-21)

**Vulnerable Code:**

```typescript
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();
```

**Problem:** In a multi-instance deployment (Vercel, AWS, Kubernetes), each instance has its own in-memory store. When Redis fails and the fallback is used, rate limits are per-instance, not global.

**Impact Calculation:**

- Intended rate limit: 10 requests/minute
- With 5 instances and in-memory fallback: 50 requests/minute
- With 10 instances: 100 requests/minute

**CVSS Score:** 4.0 (Low)

**Note:** This is marked as LOW because it only applies when Redis is down (already a critical situation), but the CRIT-01/CRIT-02 fixes should address this by failing closed instead.

**Remediation:**
If in-memory fallback is kept, add instance-aware limiting:

```typescript
// Reduce per-instance limit to account for multiple instances
const INSTANCE_COUNT_ESTIMATE = parseInt(process.env.INSTANCE_COUNT || '1', 10);
const adjustedMaxRequests = Math.ceil(config.maxRequests / INSTANCE_COUNT_ESTIMATE);
```

---

### LOW-02: Request Deduplication Bypass (No Header = No Protection)

**File:** `server/middleware/request-dedup.ts` (lines 42-47)

**Vulnerable Code:**

```typescript
const dedupId = getDedupIdentifier(request, resolvedOptions.headerNames);

if (!dedupId) {
  return handler(request, context);  // Bypass if no header provided
}
```

**Problem:** Request deduplication only works if the client sends `x-idempotency-key` or `x-request-id` header. A malicious client simply doesn't send these headers to bypass deduplication.

**Attack Vector:**

```bash
# Legitimate client sends idempotency key
curl -H "x-idempotency-key: abc123" /api/chat -d '{"content":"test"}'

# Malicious client omits header - dedup bypassed
curl /api/chat -d '{"content":"test"}'
curl /api/chat -d '{"content":"test"}'  # Not deduplicated
```

**CVSS Score:** 3.5 (Low)

**Note:** This is LOW severity because the primary rate limiting should catch this. The deduplication is an additional layer, not the primary defense.

**Remediation:**

Generate server-side deduplication key based on request content hash:

```typescript
function getDedupIdentifier(request: NextRequest, headerNames: string[]): string {
  // First, check for client-provided key
  for (const header of headerNames) {
    const value = request.headers.get(header);
    if (value) return value;
  }
  
  // Fallback: Generate hash from request body + user + timestamp bucket
  // This prevents exact duplicate requests within a short window
  const contentHash = crypto.createHash('sha256')
    .update(request.body || '')
    .update(request.headers.get('authorization') || '')
    .update(Math.floor(Date.now() / 1000).toString()) // 1-second bucket
    .digest('hex')
    .slice(0, 16);
  
  return `auto:${contentHash}`;
}
```

---

## 📋 Remediation Priority Matrix

### Immediate (This Sprint) - Critical/P0

| ID | Issue | Action | Effort |
|----|-------|--------|--------|
| CRIT-01 | Fail-open rate limiting (main) | Change to fail-closed | 1 hour |
| CRIT-02 | Fail-open rate limiting (enhanced) | Change to fail-closed | 1 hour |
| CRIT-03 | Rate limit disable flag | Add production guard | 30 min |

### Short-term (Next Sprint) - High/P1

| ID | Issue | Action | Effort |
|----|-------|--------|--------|
| HIGH-01 | IP spoofing | Validate X-Forwarded-For source | 4 hours |
| HIGH-02 | Duplicate rate limiting | Consolidate into single middleware | 2 hours |
| HIGH-03 | No global LLM rate limit | Add shared rate limiter | 3 hours |

### Medium-term (Next 2 Sprints) - Medium/P2

| ID | Issue | Action | Effort |
|----|-------|--------|--------|
| MED-01 | User/IP rate limit doubling | Track both in single check | 3 hours |
| MED-02 | Idempotency race condition | Use atomic SETNX before LLM | 4 hours |
| MED-03 | Circuit breaker inconsistency | Link Redis and LLM circuits | 2 hours |

### Low Priority (Backlog) - Low/P3

| ID | Issue | Action | Effort |
|----|-------|--------|--------|
| LOW-01 | Multi-instance fallback | Instance-aware in-memory limiting | 2 hours |
| LOW-02 | Dedup bypass | Server-side content hashing | 3 hours |

---

## Financial Risk Assessment

### Without Fixes (Current State)

| Attack Vector | Requests/Hour | Est. Cost/Hour* |
|---------------|---------------|-----------------|
| Redis failure + fail-open | Unlimited | $1,000+ |
| IP spoofing (unauthenticated) | 6,000+ | $60+ |
| Endpoint rate limit bypass | 1,800 | $18 |
| User/IP switching | 1,200 | $12 |
| Total potential exposure | **Unlimited** | **$1,000+/hour** |

*Estimated at $0.01 per LLM request (varies by model/provider)

### With Fixes (Target State)

| User Type | Requests/Hour | Est. Cost/Hour |
|-----------|---------------|----------------|
| Legitimate authenticated | 600 | $6 |
| Legitimate unauthenticated | 600 | $6 |
| Attack attempts | 0 (blocked) | $0 |
| Total expected | **600-1,200** | **$6-12/hour** |

---

## Appendix A: Files Reviewed

### Rate Limiting

- `lib/rate-limiter.ts` - Core rate limiting logic
- `server/middleware/rate-limit.ts` - Rate limit middleware
- `server/middleware/enhanced-rate-limit.ts` - Enhanced rate limiting with lockout
- `server/middleware/request-dedup.ts` - Request deduplication

### API Endpoints

- `app/api/chat/route.ts` - Non-streaming chat endpoint
- `app/api/chat/stream/route.ts` - Streaming chat endpoint
- `app/api/chat/[chatId]/route.ts` - Chat history endpoint

### LLM Service

- `lib/llm/service.ts` - LLM service with circuit breaker
- `lib/llm/token-manager.ts` - Token counting and limits

### Infrastructure

- `lib/redis/client.ts` - Redis client configuration
- `lib/redis/circuit-breaker.ts` - Redis circuit breaker
- `lib/redis/chat.ts` - Chat data layer

### Authentication (Rate Limit Related)

- `server/middleware/session.ts` - Session extraction for user-based limiting
- `server/middleware/csrf.ts` - CSRF protection (runs before rate limiting)

---

## Appendix B: Test Cases for Verification

### CRIT-01/CRIT-02: Fail-Closed Testing

```bash
# Stop Redis and verify requests are denied
docker stop redis

curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"content": "test"}'

# Expected: 503 Service Unavailable
# NOT: 200 OK with LLM response
```

### HIGH-01: IP Spoofing Prevention

```bash
# These should all be rate-limited together (same actual client)
for i in {1..15}; do
  curl -X POST http://localhost:3000/api/chat \
    -H "X-Forwarded-For: fake.ip.$i.1" \
    -H "Content-Type: application/json" \
    -d '{"content": "test"}'
done

# Expected: First 10 succeed, remaining return 429
# NOT: All 15 succeed due to spoofed IPs
```

### HIGH-03: Global Rate Limit Testing

```bash
# Hit both endpoints alternately
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/chat -d '{"content": "test"}'
  curl -X POST http://localhost:3000/api/chat/stream -d '{"content": "test"}'
done

# Expected: Total ~15 succeed across both endpoints
# NOT: 10 on /api/chat + 20 on /api/chat/stream = 30 total
```

### MED-02: Idempotency Race Condition

```bash
# Send 10 concurrent requests with same idempotency key
KEY="test-$(date +%s)"
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/chat \
    -H "X-Idempotency-Key: $KEY" \
    -d '{"content": "expensive operation"}' &
done
wait

# Expected: 1 LLM call made, 9 return cached/conflict
# NOT: Multiple LLM calls
```

---

## Appendix C: Monitoring Recommendations

### Alerts to Add

1. **Rate Limit Bypass Alert**
   - Trigger: Rate limit check errors > 10/minute
   - Action: Page on-call, investigate Redis health

2. **LLM Cost Spike Alert**
   - Trigger: LLM API calls > 2x baseline for 5 minutes
   - Action: Page on-call, review rate limiting

3. **Redis Circuit Breaker Alert**
   - Trigger: Redis circuit breaker opens
   - Action: Page on-call, all rate limiting degraded

4. **IP Spoofing Detection**
   - Trigger: Single IP sending requests with 100+ different X-Forwarded-For values
   - Action: Block IP, investigate

### Metrics to Track

```typescript
// Add to rate-limit middleware
metrics.increment('rate_limit.check', { 
  result: allowed ? 'allowed' : 'denied',
  reason: rateLimitResult.reason,
  identifier_type: identifier.startsWith('user:') ? 'user' : 'ip',
  endpoint: request.nextUrl.pathname,
});

metrics.increment('rate_limit.error', {
  error_type: error.name,
  fallback_used: usedFallback ? 'true' : 'false',
});
```

---

## Appendix D: Technical Architecture Context

This section provides context about the rate limiting architecture for AI agents implementing fixes.

### Request Flow (Current)

```plaintext
Client Request
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Next.js API Route Handler                                       │
│   app/api/chat/route.ts or app/api/chat/stream/route.ts        │
└─────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ CSRF Protection (server/middleware/csrf.ts)                     │
│   - Validates X-CSRF-Token header                               │
│   - Can be bypassed via BYPASS_AUTH env var (SECURITY ISSUE)    │
└─────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Rate Limiting Layer 1: chatRateLimit()                          │
│   server/middleware/enhanced-rate-limit.ts                      │
│   - 20 requests/minute per user or IP                           │
│   - Uses Redis key: ratelimit:chat:{identifier}                 │
│   - FAILS OPEN on Redis error (CRIT-02)                         │
└─────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Rate Limiting Layer 2: requireRateLimit()                       │
│   server/middleware/rate-limit.ts                               │
│   - 10 requests/minute (RATE_LIMITS.CHAT_MESSAGE)               │
│   - Uses Redis key: ratelimit:zset:chat:{identifier}            │
│   - FAILS OPEN on Redis error (CRIT-01)                         │
│   - Can be disabled via ENABLE_RATE_LIMITING=false (CRIT-03)    │
└─────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Request Deduplication (server/middleware/request-dedup.ts)      │
│   - Only active if client sends X-Idempotency-Key header        │
│   - Uses Redis key: reqdedup:{path}:{dedupId}                   │
└─────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Session Extraction (server/middleware/session.ts)               │
│   - Gets userId from session cookie or JWT                      │
│   - userId used for user-based rate limiting                    │
└─────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ LLM Service Call (lib/llm/service.ts)                           │
│   - callLLMWithRetry() with circuit breaker                     │
│   - Costs money per request (Gemini API)                        │
│   - Has its own circuit breaker (separate from Redis)           │
└─────────────────────────────────────────────────────────────────┘
```

### Redis Key Patterns

| Purpose | Key Pattern | TTL | File |
|---------|-------------|-----|------|
| Basic rate limit | `ratelimit:zset:chat:{user\|ip}:{id}` | 60s | `lib/rate-limiter.ts` |
| Enhanced rate limit | `ratelimit:chat:{user\|ip}:{id}` | 60s | `server/middleware/enhanced-rate-limit.ts` |
| Account lockout | `lockout:chat:{user\|ip}:{id}` | 15min | `server/middleware/enhanced-rate-limit.ts` |
| Attempt counter | `attempts:chat:{user\|ip}:{id}` | 1hr | `server/middleware/enhanced-rate-limit.ts` |
| Idempotency | `idempotency:{userId}:{key}` | 24hr | `app/api/chat/route.ts` |
| Request dedup | `reqdedup:{path}:{dedupId}` | 30s | `server/middleware/request-dedup.ts` |

### Environment Variables Affecting Rate Limiting

| Variable | Effect | Security Risk |
|----------|--------|---------------|
| `ENABLE_RATE_LIMITING=false` | Disables all rate limiting | CRITICAL if set in production |
| `BYPASS_AUTH=true` | Bypasses auth and CSRF | CRITICAL if set in production |
| `TEST_AUTH_MODE=true` | Enables test auth bypass | HIGH if misconfigured |
| `MOCK_REDIS=true` | Uses in-memory Redis mock | Rate limits not persistent |
| `TRUSTED_PROXY_IPS` | (Not implemented) Needed for IP validation | Currently missing |

### Identifier Extraction Logic

```typescript
// Current logic in getRateLimitIdentifier():
1. If userId exists → return `user:{userId}`
2. Else, get X-Forwarded-For header → return `ip:{first_ip}`
3. Fallback → return `ip:unknown`

// Problem: Step 2 trusts client-provided header without validation
```

---

## Appendix E: Fix Implementation Order (Dependency Graph)

```plaintext
CRIT-01 ─────┬─────→ CRIT-02
(fail-closed │       (fail-closed enhanced)
 rate-limit) │
             │
             └─────→ MED-03
                     (link circuit breakers)
                     [Depends on: CRIT-01, CRIT-02 pattern]

CRIT-03 ─────────────→ (standalone, no dependencies)
(production guard)

HIGH-01 ─────────────→ MED-01
(IP validation)        (dual identifier tracking)
                       [Depends on: HIGH-01 for correct IP]

HIGH-02 ─────────────→ HIGH-03
(consolidate limiters)  (global LLM rate limit)
                        [Depends on: HIGH-02 to avoid triple-limiting]

MED-02 ─────────────→ (standalone, no dependencies)
(idempotency lock)

LOW-01 ─────────────→ (only relevant if NOT fixing CRIT-01/02)
LOW-02 ─────────────→ (standalone, low priority)
```

### Recommended Implementation Sequence

1. **Phase 1 (Day 1):** CRIT-01 + CRIT-02 + CRIT-03
   - All are simple changes (just change return values/add guards)
   - No dependencies between them
   - Immediately prevents unlimited LLM costs

2. **Phase 2 (Day 2-3):** HIGH-02 first, then HIGH-03
   - HIGH-02 simplifies the rate limiting stack
   - HIGH-03 adds the missing global LLM limit
   - Order matters: consolidate before adding global limit

3. **Phase 3 (Day 4-5):** HIGH-01, then MED-01
   - HIGH-01 fixes IP extraction
   - MED-01 builds on correct IP extraction

4. **Phase 4 (Week 2):** MED-02, MED-03
   - Both are independent improvements
   - Can be done in parallel

5. **Phase 5 (Backlog):** LOW-01, LOW-02
   - Only if time permits
   - LOW-01 may be unnecessary if CRIT fixes are in place

---

## Appendix F: Related Security Audit

A broader security audit was conducted covering authentication, XSS, CSRF, and other vulnerabilities. See:

**File:** `dev-resources/improvements/security/1/audit.md`

Key related findings from that audit:

- **CRIT-02 (in audit 1):** Auth bypass mechanisms that could affect rate limiting
- **HIGH-03 (in audit 1):** Rate limiter fail-open (same as CRIT-01/02 here, more detail in this audit)
- **MED-01 (in audit 1):** CSRF token derivation issues

---

*Report generated by white hat security analysis. Manual verification and testing of all findings is recommended before deploying fixes to production.*
