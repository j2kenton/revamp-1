# Architecture Review Tasks — Prioritized Roadmap

This roadmap orders work by the Priority Stack (Security → UX → Reliability → A11Y → Performance → DX) while honoring declared dependencies.

Start here (topological + priority order):

1) J → 2) H → 3) I → 4) E → 5) F → 6) D → 7) C → 8) G → 9) A → 10) B → 11) K

## Phase 0 — Foundations (DX/Contracts)

- J. Reorganize files and create new utility modules as per the architecture plan. (Enabler; no deps)
- H. Update database schemas and TypeScript types to include richer data models (roles, titles, timestamps, etc.). (Depends on J)
- I. Implement a standardized API response wrapper for all API endpoints. (Depends on H)

## Phase 1 — Security Hardening

- E. Set up Redis for secure, server-side session management. (Depends on H, J)
- F. Implement CSRF protection for all authenticated state-changing requests. (Depends on E)
- D. Implement input sanitization for all user-provided content. (Depends on I)
- C. Implement server-side rate limiting for API endpoints. (Depends on I)

## Phase 2 — State/UX Infrastructure

- G. Configure and wrap the application in dedicated providers for Redux and TanStack Query. (Depends on J)

## Phase 3 — UX Enhancements

- A. Implement Optimistic UI for sending chat messages. (Depends on G, I)
- B. Add richer UI feedback (e.g., message status indicators, character counter). (Depends on G, I)

## Phase 4 — A11Y Compliance

- K. Ensure the application meets WCAG A compliance standards. (No deps; schedule after core UX to validate real flows)

---

Dependency map (for quick reference):

- J → G, H, E
- H → I, E
- I → A, B, C, D
- E → F
- G → A, B

Notes:

- We moved J earlier as an enabler even though DX ranks lower, because it unblocks higher‑priority Security and UX work.
- Phases 1–3 can overlap once direct dependencies are satisfied (e.g., start G after J while I/E progress).
- If constraints change, re-score tasks but keep dependencies intact.

---

## Task J — Repo Reorg and Utilities

- Dependencies: none
- Objectives:
  - [ ] Establish `app/`, `lib/`, `components/`, `types/`, `hooks/`, `server/` structure per architecture plan.
  - [ ] Create `lib/http/` for fetch helpers with typed interfaces.
  - [ ] Create `lib/validation/` for input validation/sanitization adapters.
  - [ ] Centralize env typing in `types/env.d.ts`; validate on boot.
  - [ ] Add `utils/assert.ts`, `utils/error.ts` for typed errors and guards.
  - [ ] Ensure import order linting matches guidelines.
  - [ ] Update path aliases in `tsconfig.json` and fix imports.
  - [ ] Migrate files without behavioral changes (mechanical move only).
- Acceptance Criteria:
  - [ ] Code compiles with no TS errors; strict mode enabled.
  - [ ] No relative path regressions; all imports resolve via aliases.
  - [ ] App boots and renders current routes unchanged.
- Risks & Mitigations:
  - Risk: Silent broken imports. Mitigation: `tsc --noEmit` + CI check.
  - Risk: Circular deps after moves. Mitigation: keep layering rules and lint.

## Task H — DB Schemas and Types

- Dependencies: J
- Objectives:
  - [ ] Extend schema: roles, titles, timestamps, message status, rate-limit counters.
  - [ ] Generate typed models and DTOs aligned with schema.
  - [ ] Migrations created and idempotent; rollback path defined.
  - [ ] Update `types/` to mirror DB columns and public API shapes.
- Acceptance Criteria:
  - [ ] Migrations apply cleanly on empty and existing DB.
  - [ ] Type-safe accessors; no `any` in domain types.
  - [ ] Backfill strategy documented for new non-null columns.
- Risks & Mitigations:
  - Risk: Data loss on migration. Mitigation: backups + dry-run.
  - Risk: Drift between DB and TS types. Mitigation: single source (codegen or zod schemas).

## Task I — Standardized API Response Wrapper

- Dependencies: H
- Objectives:
  - [ ] Define `ApiResponse<T>` interface with `data`, `error`, `meta`.
  - [ ] Server utilities: `ok<T>(data, meta?)`, `fail(code, message, details?)`.
  - [ ] Uniform error mapping (validation, auth, rate-limit, server).
  - [ ] Apply wrapper across all route handlers and actions.
- Acceptance Criteria:
  - [ ] All endpoints return typed `ApiResponse<T>` with correct status codes.
  - [ ] Errors include stable `code` strings; no stack traces leaked.
  - [ ] Client fetching layers parse and narrow types without `any`.
- Risks & Mitigations:
  - Risk: Inconsistent legacy responses. Mitigation: compatibility layer, deprecations.

## Task E — Redis Session Management

- Dependencies: H, J
- Objectives:
  - [ ] Provision Redis client with safe defaults (TLS if remote, timeouts, retries).
  - [ ] Store sessions server-side; rotate session IDs; set TTL.
  - [ ] Secure cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax/Strict`.
  - [ ] Central session middleware for route handlers and server actions.
  - [ ] Env validation; no secrets committed; local `.env.local` only.
- Acceptance Criteria:
  - [ ] Sessions persist, revoke, and rotate successfully; TTL enforced.
  - [ ] Cookie and cache headers verified; no PII in client storage.
  - [ ] Production Redis config documented (auth, network, persistence).
- Risks & Mitigations:
  - Risk: Session fixation. Mitigation: rotate on privilege changes.
  - Risk: Data leakage. Mitigation: limit stored data; encrypt if needed.

## Task F — CSRF Protection

- Dependencies: E
- Objectives:
  - [ ] CSRF tokens: per-session, double-submit or synchronizer pattern.
  - [ ] Validate tokens on all state-changing requests (POST/PUT/PATCH/DELETE).
  - [ ] Ensure CORS policy least-privileged; preflight configured correctly.
  - [ ] Document exemptions (purely idempotent GETs only).
- Acceptance Criteria:
  - [ ] Requests without/with invalid token are rejected (4xx) with typed error.
  - [ ] Tokens rotate on login and periodic intervals.
  - [ ] E2E tests cover typical forms and server actions.
- Risks & Mitigations:
  - Risk: Token leakage. Mitigation: `HttpOnly` cookie; no logs; short TTL.

## Task D — Input Sanitization

- Dependencies: I
- Objectives:
  - [ ] Introduce central validation via zod/yup in server handlers.
  - [ ] HTML sanitization for user content (e.g., DOMPurify on server or trusted lib).
  - [ ] Escape output where needed; default denylist for dangerous tags/attrs.
  - [ ] File uploads: validate type/size; virus scan hook if applicable.
- Acceptance Criteria:
  - [ ] All entry points validate payloads; invalid input returns structured errors.
  - [ ] Stored content is sanitized; reflected output is escaped.
  - [ ] Security gates checklist met for XSS/Injection.
- Risks & Mitigations:
  - Risk: Over-sanitization harming UX. Mitigation: allowlist with tests.

## Task C — Rate Limiting

- Dependencies: I
- Objectives:
  - [ ] Implement per-IP and per-user sliding window counters in Redis.
  - [ ] Define policy per endpoint (burst + sustained limits; stricter on auth).
  - [ ] Standard 429 response with `Retry-After` and typed `ApiResponse` error.
  - [ ] Include server-side logging + alerting on abuse patterns.
- Acceptance Criteria:
  - [ ] Limits enforced and configurable per environment.
  - [ ] Legitimate usage unaffected under normal conditions.
  - [ ] Abuse attempts recorded with minimal PII.
- Risks & Mitigations:
  - Risk: Shared-IP false positives. Mitigation: combine with user ID when auth.

## Task G — Providers (Redux + TanStack Query)

- Dependencies: J
- Objectives:
  - [ ] Create `providers/` RSC wrapper with QueryClient and Redux store.
  - [ ] Persist only non-sensitive state; avoid storing tokens client-side.
  - [ ] Configure Query defaults: retries, staleTime, GC, error boundaries.
  - [ ] Add typed hooks: `useAppDispatch`, `useAppSelector`.
- Acceptance Criteria:
  - [ ] App renders with providers in `app/layout.tsx` (RSC-compatible boundaries).
  - [ ] No hydration warnings; client components only where needed.
  - [ ] Query + Redux types inferred across app without `any`.
- Risks & Mitigations:
  - Risk: Over-global state. Mitigation: prefer component state; keep store lean.

## Task A — Optimistic UI (Chat Send)

- Dependencies: G, I
- Objectives:
  - [ ] Use TanStack Query mutation with optimistic update and rollback on error.
  - [ ] Temporary message IDs; reconcile with server response.
  - [ ] Disable send while exceeding character limits; handle retries.
  - [ ] Server action ensures idempotency via client-generated IDs.
- Acceptance Criteria:
  - [ ] UI shows sent state immediately; correct order preserved.
  - [ ] On failure, message visually reverts with actionable error.
  - [ ] No duplicate messages after retry/refresh.
- Risks & Mitigations:
  - Risk: Race conditions. Mitigation: idempotency keys + reconciliation.

## Task B — Richer UI Feedback

- Dependencies: G, I
- Objectives:
  - [ ] Message status indicators: sending/sent/failed/read.
  - [ ] Character counter with soft and hard thresholds.
  - [ ] Accessible live region for async status updates.
  - [ ] Non-blocking toasts for transient errors; inline errors for blocking.
- Acceptance Criteria:
  - [ ] Status changes are perceivable via text and icons.
  - [ ] Screen reader announces status changes (aria-live polite).
  - [ ] Counters adhere to limits and color contrast.
- Risks & Mitigations:
  - Risk: Over-notification. Mitigation: debounce announcements; group updates.

## Task K — WCAG A Compliance Baseline

- Dependencies: none (scheduled after UX to test real flows)
- Objectives:
  - [ ] Keyboard: tab order, focus outlines, skip links, traps eliminated.
  - [ ] Semantics: correct roles, labels, names; form error associations.
  - [ ] Color contrast checks; prefers-reduced-motion support.
  - [ ] Dynamic updates announced via aria-live where meaningful.
- Acceptance Criteria:
  - [ ] Axe-core scan: 0 critical/serious issues across key pages.
  - [ ] Keyboard-only journey succeeds for chat flow.
  - [ ] Minimum WCAG 2.1 A met; document AA gaps.
- Risks & Mitigations:
  - Risk: Regressions post-merge. Mitigation: add automated a11y checks in CI.

---

## Security Gates Checklist (Global)

- [ ] Input sanitization for all user fields (D)
- [ ] No hardcoded secrets or API keys (E)
- [ ] try/catch on unpredictable operations; typed errors (I, E, G)
- [ ] Edge case handling: timeouts, nulls, network errors, race conditions (A, B, C)

## Testing Plan (Global)

- Unit
  - [ ] Utils (validation, http, error mappers): happy path + edge cases.
  - [ ] Rate limiter logic with window math.
- Integration
  - [ ] API routes return `ApiResponse<T>` and correct status codes.
  - [ ] Sessions + CSRF round trip.
- E2E
  - [ ] Chat: optimistic send, failure rollback, retry dedupe.
  - [ ] A11y: keyboard journeys; axe-core snapshots in CI.

## Implementation Notes

- Next.js App Router defaults: prefer RSC; fetch server-side; use Server Actions for mutations.
- Client data fetching: useSWR or TanStack Query for dynamic client needs.
- TypeScript: interfaces for objects, standard enums, avoid `any`.
- Import order: React/Next → third-party → `@/` absolute → relative.
