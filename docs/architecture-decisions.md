# Architecture Decisions

Short records of the non-obvious choices in this codebase, and what each one
cost. Format is loosely ADR: context, decision, consequences.

---

## ADR-001 — SSE over `fetch`, not `EventSource`

**Context.** Assistant replies stream token-by-token. The browser ships a
built-in Server-Sent Events client, `EventSource`, which handles reconnection
and event framing for free.

**Decision.** Don't use it. Use `fetch` with a `ReadableStream` reader and parse
the SSE wire format manually (`lib/sse/`).

**Why.** `EventSource` cannot set request headers. This app authenticates with
a bearer token in an `Authorization` header (see ADR-002), and there is no
`EventSource` API to attach one. The alternatives were putting the token in a
query string — where it lands in server logs and browser history — or issuing a
short-lived cookie purely for the stream, which reintroduces the CSRF surface
the bearer model avoids.

**Consequences.** We own reconnection, backoff, and event framing ourselves
(`useStreamingResponse`). The framing logic is isolated in `lib/sse/` as pure
functions, so the protocol is unit-testable without an HTTP stream. Chunk
boundaries do not respect event boundaries, so the parser returns a `remainder`
the caller carries into the next read — the single most likely source of
intermittent bugs if it were done naively.

---

## ADR-002 — Stateless bearer auth; no server session for the API

**Context.** Two identity providers (Google Identity Services and Microsoft
MSAL), and exactly one may be active per browser session.

**Decision.** Every API request authenticates statelessly from an
`Authorization: Bearer` header. No session cookie, no server-side session
record. The CSRF token is derived deterministically as `SHA-256(bearer token)`
rather than stored.

**Why.** Two providers with different token lifetimes make a shared server
session a synchronisation problem. Deriving CSRF from the bearer means there is
no server state to fall out of sync, and no cookie means the classic
cookie-borne CSRF vector doesn't exist in the first place.

**Consequences.** Drives ADR-001 (no `EventSource`). Chat routes cannot be
React Server Components, because the token lives in client memory and RSC
fetches happen server-side without it — so the chat surface is a client tree
below a thin server shell.

---

## ADR-003 — Route Handler, not Server Action, for chat sends

**Context.** Next.js offers Server Actions for mutations, which would avoid
hand-writing an endpoint.

**Decision.** Use a Route Handler (`app/api/chat/stream/route.ts`).

**Why.** Server Actions cannot stream a response body incrementally — they
resolve once. Streaming is the entire point of this feature. A Route Handler
is also where the policy chain naturally lives: CSRF validation, rate limiting,
ownership checks, and context truncation all need to run before the model call,
in a defined order.

**Consequences.** More boilerplate than a Server Action. In exchange, the
endpoint is an explicit trust boundary with one place to enforce policy.

---

## ADR-004 — Two message stores: live state and the query cache

**Context.** During a stream, message content changes on every token. The
persisted conversation lives in a TanStack Query cache.

**Decision.** Keep in-flight messages in component state (`liveMessages`) and
merge them over the persisted cache at render time (`mergeMessages`).

**Why.** Writing every token into the query cache alone would make the cache
the hot path for high-frequency updates it isn't designed for, and would blur
"confirmed by the server" with "optimistic". Keeping them separate makes the
distinction explicit: live messages are unconfirmed, the cache is truth.

**Consequences.** A merge step on every render, keyed by message ID with the
live copy winning. The merge sorts fully rather than doing a linear merge of
two ordered lists — a deliberate trade, because a full sort is robust against
clock skew between optimistic client timestamps and server timestamps, and
conversation lengths make the difference unmeasurable.

---

## ADR-005 — Remount the chat subtree on identity change

**Context.** Switching accounts must not leak the previous account's
conversation into the new session.

**Decision.** `app/chat/page.tsx` renders the authenticated shell with
`key={authIdentityKey}`.

**Why.** Manually resetting state means enumerating every piece of it —
messages, chat ID, in-flight stream, cached history — and staying correct as
state is added. A changed `key` makes React discard the subtree wholesale.
This is React's own documented mechanism for resetting state on identity
change.

**Consequences.** An account switch throws away work in progress, which is the
correct behaviour here. Belt-and-braces: query cache entries are also
namespaced by `authIdentityKey`, and `IdentityCacheReset` purges the `['chat']`
subtree on change — so a leak requires all three to fail.

---

## ADR-006 — Circuit breaker before retry tuning

**Context.** The app depends on two external services that can fail: Redis and
the Gemini API.

**Decision.** Wrap both in a circuit breaker that fails fast when open, and
serve a canned fallback reply rather than an error when the LLM breaker trips.
Retries use exponential backoff with jitter (`lib/utils/backoff.ts`).

**Why.** Retries alone make a struggling dependency worse — every client
retrying against a service that's already saturated is the failure amplifying
itself. The breaker bounds total load on a failing dependency; jitter stops
recovered clients from returning in lockstep. The breaker matters more, which
is why it exists at every call site and not just the LLM one.

**Consequences.** Redis rate-limit checks **fail closed** (deny) when the
breaker is open, because failing open would remove the only cost control in
front of a paid API. That trades availability for cost safety, deliberately.

---

## ADR-007 — Rate limiting as cost control, and what it does not cover

**Context.** Every chat message costs money. Abuse is a billing problem before
it's an availability problem.

**Decision.** Layered limits: a per-identity LLM limit shared across every
LLM-calling endpoint (`RATE_LIMITS.LLM_PER_IDENTITY`), plus per-endpoint limits
with progressive delay and lockout. Identity is user ID when signed in, client
IP otherwise.

`server/middleware/client-ip.ts` is the **only** place in the codebase that
reads `X-Forwarded-For` / `X-Real-IP`, and it trusts the forwarded chain only
when the connecting hop is a configured trusted proxy. Otherwise an attacker
mints a fresh bucket per request by rotating the header. Session and audit
metadata resolve through the same module (`getSessionClientIp`) so an audit
trail can never record a caller-claimed address.

**Why.** One bucket per identity across endpoints means an abuser can't get a
fresh allowance by switching from `/api/chat` to `/api/chat/stream`.

**The gap per-identity limits cannot close.** An attacker who rotates both
account and IP gets a full allowance every time — tightening per-identity
limits doesn't win that race, it just degrades real users first. So there is
a second, coarser control: `RATE_LIMITS.LLM_AGGREGATE`, a single counter whose
key carries **no identifier at all** (`AGGREGATE_LLM_BUCKET = 'all'`). Every
LLM request in the deployment shares one hourly budget. It's sized as an
operational cost ceiling rather than a UX limit — legitimate traffic should
never reach it, and reaching it is a signal something is wrong.

**Consequences.** Both checks fail closed when Redis is unavailable
(see ADR-006) — the cost control is the thing you least want to fail open in
front of a paid API. The aggregate limit is deliberately blunt: when it trips,
legitimate users are turned away too. That is the correct trade for a spend
ceiling, but it means the number is an operational decision, not a product one.

---

## ADR-008 — Manual memoization only where an effect depends on identity

**Context.** The project runs the React Compiler (`reactCompiler: true`), which
inserts memoization automatically at build time.

**Decision.** No hand-written `useCallback`/`useMemo`, with one exception:
`closeConnection` in `useStreamingResponse`.

**Why.** `closeConnection`'s identity is a dependency of the unmount-cleanup
effect. If it changes per render, that effect tears down and re-runs on every
render — aborting the live SSE connection mid-response rather than on unmount.
That is a correctness dependency, not a performance one.

**Consequences.** Jest transforms via `ts-jest`, which never applies the React
Compiler — only the real Next.js build does. So the test suite exercises
unmemoized code and cannot verify the compiler's guarantee. A dedicated test
pins the referential stability of `closeConnection` instead. Rule: let the
compiler handle memoization when nothing reads a function's identity; keep it
manual when an effect's dependency array does.
