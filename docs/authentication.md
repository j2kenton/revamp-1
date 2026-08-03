# Authentication Flow (Google + MSAL)

This document describes the dual-provider authentication flow in the application: **Google** (Google Identity Services / GIS), the primary and more prominently displayed option, and **Microsoft** (MSAL / Azure AD), a fully functional secondary option. Exactly one provider is ever "active" per browser session.

## Overview

### Google (primary)

1. The user navigates to the landing page or the chat sign-in gate, where the Google button is rendered first/above Microsoft.
2. The user clicks the Google button (rendered entirely by GIS via `google.accounts.id.renderButton`).
3. GIS returns a signed ID token (JWT) to a callback registered once with `google.accounts.id.initialize()`.
4. The client uses that ID token directly as the bearer token — there is no separate access-token exchange.
5. The server verifies the ID token's signature against Google's published JWKS, checks `aud`/`iss`/`email_verified`, and constructs an ephemeral per-request session object.

### Microsoft (secondary)

1. The user clicks "Sign in with Microsoft".
2. The application opens an MSAL popup (falling back to a full-page redirect if the popup is blocked or the app is embedded).
3. The user authenticates with Microsoft; MSAL returns an access token and account info.
4. The application stores the access token in memory and caches account state in `sessionStorage`.
5. The server verifies the MSAL access token against Azure AD's JWKS and constructs an ephemeral per-request session object.

Google-authenticated and Microsoft-authenticated users get the identical post-login chat experience.

## Frontend Integration

- `app/layout.tsx` nests providers as `MsalProvider` → `AuthProvider` → `SessionProvider` → `TanStackQueryProvider` (with `IdentityCacheReset` as its first child) → `ReduxProvider`. `AuthProvider` is mounted directly inside `MsalProvider` — there is no separate `GoogleAuthProvider` layer in the app tree.
- `lib/auth/MsalProvider.tsx` boots a singleton `PublicClientApplication`, runs `initialize()`/`handleRedirectPromise()`, and gates children behind that. **It never calls `setActiveAccount` itself** — a captured redirect result is handed off through a module-level, read-once holder (`consumePendingRedirectAccount()`) for `AuthProvider` to consume. Keeping selection out of this provider is what makes the marker read in the next paragraph enforceable: nothing can select an account before it's read.
- `lib/auth/GoogleAuthProvider.tsx` exports `useGoogleAuthState()`, the hook that owns all Google state — lazy GIS script loading (`lib/auth/googleGsiLoader.ts`, a shared singleton loader so multiple consumers never double-inject the script), a single guarded `google.accounts.id.initialize()` call, the current decoded ID token, a one-shot silent restoration attempt on reload, and the pre-expiry renewal timer — **and** is the sole *post-resolution* MSAL account selector. Its bootstrap effect (mount-only, never during render, so there's nothing for server/client hydration to disagree about) first consumes any captured redirect result (always an explicit Microsoft login, selected regardless of the stored marker) and otherwise restores a cached MSAL account **only when the last explicit provider choice was Microsoft** (marker absent or `'microsoft'`; see "Provider marker" below) — a cached account is never selected after a Google login or an explicit sign-out. `GoogleAuthProvider`, the context-provider component in the same file, is a thin wrapper around this hook kept only for the isolated `GoogleAuthProvider.*.test.tsx` suites — it is not mounted in the app tree.
- `lib/auth/AuthProvider.tsx` is the **single owner of the combined auth state** exposed to the rest of the app, and owns the Google SDK lifecycle directly rather than reading it from a separately-mounted provider: it calls `useGoogleAuthState()` itself, merges that with MSAL state (`useMsal()`) into one value — `login(provider)`, `logout()`, `acquireToken()`, `acquireGraphToken(scopes)`, `status`, `provider`, `authIdentityKey`, `user`, `accessToken`, `needsReauth` — computed once per render and shared via React context, rather than recomputed independently inside every consumer. It also re-provides `GoogleAuthContext` (with the same value it computed) for the one other consumer that needs raw Google state, `GoogleSignInButton`. `lib/auth/useAuth.ts` is a thin `useContext` re-export of it, kept as the stable import path consumed by all UI (`ChatPage`, `useFetchChatHistory`, `useStreamingResponse`, the sign-in surfaces, `IdentityCacheReset`). `useProfilePhoto` likewise has no MSAL SDK access of its own — it acquires its Graph token exclusively through `useAuth().acquireGraphToken()`. MSAL persists its own "active account" pointer in `sessionStorage` and silently restores it on every `initialize()`, independent of app code — so a raw `getActiveAccount()` presence is corroborated against the persisted provider marker on **every** read (not just at selection time): an MSAL account only counts as authenticated when the marker is absent or `'microsoft'`. This is what enforces mutual exclusivity — once Google's credential callback persists the `'google'` marker, MSAL's cached selection stops counting as authenticated on the very next read, with no explicit MSAL-side deactivation call needed. Account selection itself has exactly two call sites codebase-wide: `useGoogleAuthState()`'s post-resolution bootstrap effect (called from within `AuthProvider`), and `AuthProvider`'s explicit popup/redirect login path (which persists the marker before selecting, and — for the redirect fallback — before the navigation that departs the page).
- `components/auth/GoogleSignInButton.tsx` is the sole call site of GIS's `renderButton`. It renders nothing (only a console warning) when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` isn't configured, and reports script-load failures via an `onError` prop.
- `components/landing/LandingSignInButton.tsx` and `app/chat/components/ChatSignInPrompt.tsx` render the Google button first/above the Microsoft button in DOM order (so visual prominence and tab order agree), share a loading treatment while `status === 'resolving'`, and route script-load failures and login errors through the same `role="alert"` region with a Retry control — Microsoft remains fully usable while a Google error is displayed.
- Client requests attach:
  - `Authorization: Bearer <MSAL access token OR Google ID token>`
  - `X-CSRF-Token: SHA-256 hash of that same bearer token` (`lib/auth/csrf.ts` — provider-agnostic; it just hashes whatever token is in play)

## Provider Marker and Bootstrap Resolution

A small `sessionStorage` marker (`lib/auth/authProviderMarker.ts`) records the user's last explicit choice: `'microsoft' | 'google' | 'signed-out' | absent`. It exists purely to answer one question on page load: **should a cached Microsoft account or a Google restoration attempt run automatically?**

- Marker absent or `'microsoft'` → `useGoogleAuthState()`'s bootstrap effect (running inside `AuthProvider`) may select a cached MSAL account.
- Marker `'google'` (with a previously persisted `lastGoogleSub`) → the same bootstrap effect attempts exactly one silent/One Tap restoration prompt per page load; if suppressed or the sub doesn't match, the user lands on the sign-in surface with no error, not a silent Microsoft fallback.
- Marker `'signed-out'` → neither provider is auto-selected or restored.
- A captured redirect result is always treated as an explicit Microsoft login (the marker is set to `'microsoft'` and the account selected) regardless of what the stored marker said before the redirect departed.

This is orthogonal to *runtime* provider switching: once the page has settled, activating Google persists the `'google'` marker (which alone is enough to stop MSAL's still-selected account from counting as authenticated, per the facade behavior above — MSAL's own cache is left untouched, not logged out) and activating Microsoft clears the Google credential/pin (and its `lastGoogleSub`). Those two transitions are the only two places provider state changes at runtime; account *selection* itself only ever happens in the two call sites named above.

`useAuth().status` is `'resolving'` while this bootstrap/restoration window is open, `'unauthenticated'` once settled with no active provider, and `'authenticated'` once one is active. UI surfaces disable both login actions and show a loading treatment during `'resolving'` — including the Microsoft button, so this window is capped independently of the GIS script loader's own (longer, retry-oriented) load timeout: `BOOTSTRAP_RESOLVING_TIMEOUT_MS` in `GoogleAuthProvider.tsx` bounds `isRestoring` to ~5s even if the GIS script load hangs, so a stalled Google restoration attempt can never leave the user with no working sign-in option. The underlying restoration attempt keeps running in the background past that cap and can still land a credential later.

## Token Renewal and Degradation

- **Microsoft**: access tokens expire in ~1 hour. `AuthProvider.tsx` proactively refreshes them (5-minute buffer) via `acquireTokenSilent`, falling back to an interactive popup/redirect on `InteractionRequiredAuthError`, with exponential-backoff retries for transient failures.
- **Google**: `useGoogleAuthState()` (owned by `AuthProvider`) schedules a renewal ~5 minutes before the current ID token's `exp`, calling `google.accounts.id.prompt()`. A renewed credential is accepted when its `sub` matches the pinned identity (the active session or the persisted `lastGoogleSub`); an automatic credential for a *different* `sub` is rejected (not silently switched), while an explicit user gesture (a real button click) for a different `sub` is treated as an intentional account switch. If renewal is suppressed or rejected, the current token keeps working until it actually expires — the user sees a non-blocking, accessible banner (`STRINGS.auth.reauthBanner`), never a silent failure or silent identity swap. Only once the token fully expires is the user gated back to the sign-in surface. A 30-second pre-expiry watchdog (`REAUTH_WATCHDOG_BUFFER_MS` in `GoogleAuthProvider.tsx`) forces the banner even if GIS's moment-notification callback never fires or misreports (a documented gap under FedCM), so continuity never depends on that callback alone.

### Renewal spike — gate evaluation

> **Decision record — criterion 9 (renewal-spike gate)**
> - **Status:** Not evaluated (not "failed" — no real Google session was available to measure against; see below).
> - **Decision:** Ship the always-on banner + explicit re-login path as the guaranteed floor (already implemented, see "What is established instead" below); treat automatic renewal as best-effort only; do not assume routine silent renewal until the real measurement below is taken.
> - **Owner of the outstanding measurement:** Jonathan Kenton, during the staging smoke test (checklist item below) — this is the same external dependency as criterion 15's staging origin registration.
> - **Approval:** **Approved by Jonathan Kenton on 2026-07-20.** Banner-first is accepted as the recorded outcome for this gate: if Google's silent renewal does not carry a session past the ID token's ~1h lifetime, an explicit re-auth click at that interval is the expected experience, not a defect. This approval covers shipping without the measurement; it does not retire the measurement, which remains tracked as checklist item 9 below. Should the staging run show that silent renewal completes, the recorded outcome upgrades from "assumed worst case" to "measured" with no code change — `scheduleRenewal` is unconditional and identical either way.

The plan's step 7 called for a spike evaluating whether `google.accounts.id.prompt()` with `auto_select: true` can carry a signed-in user through a >1h chat session (Google's ID-token lifetime) without an interactive prompt, and required the outcome to be recorded here regardless of which way it goes.

**This could not be empirically measured in this workspace.** The gate requires a real Google account with an active browser session, a deployed origin registered with Google (GIS refuses to initialize against `localhost` without a registered origin in some configurations, and One Tap's cooldown/cross-origin-iframe behavior is itself session- and browser-state-dependent), and a wall-clock hour of observation — none of which a sandboxed, headless dev environment can provide. This is the same external dependency tracked for the staging smoke checklist below and for criterion 15's registered JavaScript origins.

**What is established instead, from Google's own GIS documentation and the implementation:**
- `prompt()` has no documented guarantee of silent completion; it may surface One Tap, the browser credential manager, or nothing at all, depending on the user's Google session state, prior dismissals (One Tap's cooldown), and third-party-cookie/FedCM policy in the browser.
- Per the plan's accepted design, **the gate's outcome does not change what ships**: the banner + explicit re-login path (`STRINGS.auth.reauthBanner`) is unconditionally wired as the guaranteed floor, backed by the 30-second watchdog above so the banner appears even if GIS's own suppression signal is unreliable. Automatic renewal is strictly a best-effort layer on top.
- Per the plan's decision, in the absence of a measured gate result the accepted default is: **treat the gate as not passed** — i.e. do not assume routine silent renewal — and rely on the banner path as the primary, expected user experience for session continuity past token expiry. This is a conservative reading that requires no further code change if the empirical result later comes back favorable; it only means the smoke checklist item below must be exercised to confirm (or improve) it against a real deployment.

**Follow-up action (tracked, not blocking):** run the spike for real during the staging smoke test (owner: Jonathan Kenton) — sign in on staging, leave the tab open past the ID token's ~1h lifetime, and record whether the banner or a silent renewal was observed. Record the result as a checklist item (added below) rather than only in this file, since the PR description is the plan's required record-of-outcome location.

## Cross-Account Chat Isolation

Chat query cache entries are namespaced by `authIdentityKey` (`microsoft:<homeAccountId>` or `google:<sub>`) via `app/chat/utils/chatQueryKey.ts`, used by `useFetchChatHistory` and `useStreamingResponse`. `components/auth/IdentityCacheReset.tsx` additionally purges the entire `['chat']` cache subtree whenever the identity changes (including the transition to signed-out), and `app/chat/page.tsx` remounts the authenticated chat surface (`key={authIdentityKey}`) on every identity change so no in-flight stream or rendered message from a prior account can survive a switch.

## Session Management and the Issuer Dispatcher

**The live authentication contract is stateless, per-request bearer validation — not a Redis-backed session.** No application code path ever calls `setSessionCookie` (`server/middleware/session.ts`), so the `session_id` cookie is never set and every protected request falls through to the JWT fallback branch: `getSessionFromRequest` finds no cookie and calls `getSessionFromJwtFallback`, which validates the request's bearer token and constructs an **ephemeral, per-request `SessionModel`** — nothing is persisted to Redis. The Redis-session helpers (`lib/redis/session.ts`, `authenticateWithMsal`, `withMsalAuth`) exist in the codebase but have no callers on the live chat routes; they are vestigial rather than a failover path.

Since the bearer token could be either a Google ID token or an MSAL access token, `getSessionFromJwtFallback` first **peeks the token's (unverified) `iss` claim** to decide which validator to run — no signature verification happens before this routing decision:

- `iss` matches `https://accounts.google.com` or `accounts.google.com` → `server/middleware/google-auth.ts` (`validateGoogleToken`): verifies the RS256 signature against Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`), checks `aud` equals `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, and requires `email_verified === true`. Normalizes to `userId = 'google:' + sub`.
- `iss` matches the Entra v2 issuer shape (`https://login.microsoftonline.com/<tenant>/v2.0`) **and** satisfies the configured tenancy policy (`isMsalIssuer` in `server/middleware/msal-auth.ts`) → the existing `validateMsalToken`. A configured single tenant (`NEXT_PUBLIC_AZURE_AD_TENANT_ID` set to a real tenant ID) pins to exactly that tenant; leaving it as `'common'` preserves today's any-Entra-tenant acceptance (recommended: configure a specific tenant and tighten this later).
- Anything else → rejected (401) with **neither validator invoked**.

A deterministic CSRF token is derived the same way regardless of provider: `SHA-256` of the raw bearer token (`lib/auth/csrf.ts` client-side, mirrored server-side in `server/middleware/session.ts`), so `server/middleware/csrf.ts` needs no provider-specific changes.

## Middleware

`server/middleware/session.ts` contains the session middleware; `server/middleware/msal-auth.ts` and `server/middleware/google-auth.ts` contain the provider-specific token validators; `server/middleware/csrf.ts` enforces CSRF protection for state-changing requests, unaffected by which provider issued the session.

## Configuration

See the README's [Environment Variables](../README.md#environment-variables) section for `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / Azure AD setup steps. No client secret is required or committed for Google sign-in.

## Manual Staging Smoke Checklist

Run through this after deploying to staging (record the outcome in the PR description):

- [ ] Google login succeeds with the deployed CSP and the staging origin registered as an authorized JavaScript origin in Google Cloud Console.
- [ ] Sign-out works, including: a cached Microsoft account does not resurrect the session after a Google sign-out, and a reload after sign-out shows no authenticated flash.
- [ ] A send-message round trip works end-to-end for a Google-authenticated user.
- [ ] A mid-session reload either silently restores the same Google account once, or (if suppressed) lands the user on the sign-in surface with no error.
- [ ] A normal Microsoft popup login completes.
- [ ] A Microsoft popup-blocked redirect login completes end-to-end.
- [ ] Switching accounts via the Google button shows no prior account's chat history.
- [ ] The re-auth banner appears before token expiry when Google renewal is suppressed.
- [ ] **Renewal-spike gate**: stay signed in on a Google account past the ID token's ~1h lifetime and record which outcome was observed — automatic renewal completed silently (gate passes; routine automatic renewal), or the re-auth banner appeared and required an explicit click (gate fails; banner remains the primary, expected path). Either outcome is acceptable per the plan; record it in the PR description.
