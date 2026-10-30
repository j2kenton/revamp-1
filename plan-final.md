# Implementation Checklist: Add Google Sign-In as Primary Login Option

## Goal

Add Google sign-in as a primary, more prominent option alongside the existing Microsoft (MSAL/Entra ID) login on both the landing page and the chat gate — Google rendered first/above Microsoft — while leaving Microsoft's authentication behavior unchanged and giving Google users the same post-login chat experience, with well-defined provider/account transitions and no cross-account data leakage.

---

## 1. Google OAuth Configuration (Prerequisite)

- [ ] Create a Google Cloud OAuth 2.0 Web client configured for callback mode (no redirect URIs).
- [ ] Register `http://localhost:3000` as an authorized JavaScript origin for local dev.
- [ ] Obtain and register staging/production authorized JavaScript origins from the deployment platform's configured domains (tracked prerequisite, owner: requester).
- [ ] Configure OAuth scopes as `openid email profile` only.

## 2. Environment Variables

- [ ] Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to `types/env.d.ts`.
- [ ] Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to `.env` example file(s), with no secret values committed.

## 3. Content Security Policy

- [ ] In `proxy.ts`, add `https://accounts.google.com/gsi/client` to `script-src`.
- [ ] In `proxy.ts`, add `frame-src https://accounts.google.com/gsi/`.
- [ ] In `proxy.ts`, add `https://accounts.google.com/gsi/style` to `style-src`.
- [ ] Confirm existing `connect-src https:` already covers `https://accounts.google.com/gsi/` (no change needed).
- [ ] Extend `__tests__/unit/proxy.security.test.ts` to assert the exact updated CSP directive set.

## 4. GIS Script Loading + Types

- [ ] Add ambient TypeScript declaration file `types/google-gsi.d.ts` for `window.google.accounts.id`.
- [ ] Type `CredentialResponse.select_by` as the documented literal union widened with `(string & {})`.
- [ ] Include `prompt()` moment-notification types for best-effort suppression detection.
- [ ] Add a GIS script loader module in `lib/auth/` implemented as a module-level singleton load promise shared by all consumers.
- [ ] Guard script injection so it only occurs when the client ID is present, bypass auth is off, and the caller signals first need (lazy load).
- [ ] Make the loader promise reject with a distinguishable load-failure error on script load failure.
- [ ] Ensure a successful script load is never torn down by an individual consumer's unmount (unmount only detaches that consumer's pending listeners).
- [ ] Reset the singleton on a failed load so a later attempt can retry.
- [ ] Add loader tests: no script injection without a client ID; shared load across two concurrent consumers; script survives one consumer unmounting while another still uses it; load failure followed by retry after reset; pending-listener cleanup on unmount.

## 5. Shared Auth Context, MsalProvider Deferred Selection, and Facade Refactor

### MsalProvider changes
- [ ] Remove the `setActiveAccount` call for the redirect-account selection at `MsalProvider.tsx:30–32`.
- [ ] Remove the unconditional cached-account `setActiveAccount` call at `MsalProvider.tsx:35–40`.
- [ ] Remove the `LOGIN_SUCCESS` event callback at `MsalProvider.tsx:43–49` entirely (not relocated).
- [ ] Verify `MsalProvider.tsx` contains zero `setActiveAccount` calls after the above removals.
- [ ] Add a module-level consume-once redirect-result holder, exported alongside `msalInstance`, populated at most once per page load by the init effect from `handleRedirectPromise()`'s result.
- [ ] Implement holder semantics: reading it (from `AuthProvider`) clears it to `null`; it is never populated if MSAL bootstrap throws.
- [ ] Keep `initialize()`, `handleRedirectPromise()` processing, and the existing `initialized` gating of children unchanged otherwise.

### AuthProvider
- [ ] Create `lib/auth/AuthProvider.tsx` as a React context provider.
- [ ] Implement `status: 'resolving' | 'unauthenticated' | 'authenticated'` starting in `resolving` on every page load.
- [ ] Implement a client mount effect that reads the tri-state persisted marker (`absent | 'microsoft' | 'google' | 'signed-out'`) and the persisted `lastGoogleSub` from `sessionStorage`.
- [ ] While resolving, expose `isAuthenticated: false`, `accessToken: null`, `authIdentityKey: null`, and perform no MSAL account selection/restoration, token acquisition, or GIS work.
- [ ] Implement the post-resolution controller: first consume the redirect-result holder (if present, treat as explicit Microsoft login — set marker `'microsoft'`, `setActiveAccount(redirectResult.account)`, update `authIdentityKey`).
- [ ] When no redirect result: if marker is absent or `'microsoft'`, perform cached-account selection (`getAllAccounts()` + `setActiveAccount`) that `MsalProvider` used to do.
- [ ] When no redirect result: if marker is `'google'` or `'signed-out'`, select no MSAL account.
- [ ] Own the Google credential, its `exp`, and its `sub` in shared state.
- [ ] Own a single guarded GIS `initialize()` call (with `auto_select: true` and the shared credential callback), invoked at most once per page load.
- [ ] Implement the shared `requestGoogleCredential()` routine that ensures GIS is initialized and calls `google.accounts.id.prompt()`.
- [ ] Implement the restoration trigger: on resolution, if marker is `'google'` and `lastGoogleSub` is non-empty, initialize GIS and call `requestGoogleCredential()` exactly once per page load.
- [ ] Implement the restoration trigger's skip path: if marker is `'google'` and `lastGoogleSub` is missing, skip the prompt and resolve to unauthenticated.
- [ ] Expose `authIdentityKey: string | null` as `'microsoft:' + homeAccountId`, `'google:' + sub`, or `null`, updated on every provider/account change.
- [ ] Mount `AuthProvider` in `app/layout.tsx` directly inside `MsalProvider`, above `SessionProvider` (final nesting: `MsalProvider` → `AuthProvider` → `SessionProvider` → `TanStackQueryProvider` → children).

### Facade (`lib/auth/useAuth.ts`)
- [ ] Refactor `useAuth.ts` into a context consumer preserving the `UseAuthReturn` shape, adding `status`, active provider, and `authIdentityKey`.
- [ ] Implement `login(provider)`, `logout`, and `acquireToken` dispatching by provider.
- [ ] Implement the Microsoft popup success path as the sole popup-selection handler: `loginPopup()` returns the `AuthenticationResult` directly; on success, persist marker `'microsoft'`, then call `setActiveAccount(result.account)`, then update `authIdentityKey`, in that order.
- [ ] Implement the Microsoft popup-blocked redirect fallback: persist marker `'microsoft'` to `sessionStorage` immediately before invoking `loginRedirect` (before navigation departs).
- [ ] Verify account selection has exactly two call sites in the codebase: the `AuthProvider` post-resolution controller and the facade's explicit login path.

### Google config
- [ ] Add `lib/auth/googleConfig.ts` including the `select_by` explicit-gesture allowlist as a named constant: `'user'`, `'user_1tap'`, `'user_2tap'`, `'btn'`, `'btn_confirm'`, `'btn_add_session'`, `'btn_confirm_add_session'`.
- [ ] Implement the GIS credential callback: parse `sub` from the incoming credential (client-side unverified decode) and classify `select_by` via the allowlist (anything not listed, including `'auto'`, is classified automatic).
- [ ] Implement acceptance rule: credential `sub` matches the active pin (in-memory `sub`, else persisted `lastGoogleSub`) → accepted as renewal/restoration, refresh `lastGoogleSub`.
- [ ] Implement rejection rule: different `sub` + automatic classification → rejected, falls back to suppressed-renewal banner or unauthenticated state.
- [ ] Implement account-switch rule: different `sub` + explicit-gesture classification → accepted as an account switch under the identity-change rule.
- [ ] Persist `lastGoogleSub` on every explicit Google sign-in and every accepted identity-pinned renewal; clear it on logout and on switch to Microsoft.

### GoogleSignInButton
- [ ] Add a single reusable `GoogleSignInButton` component (in `components/` or `lib/auth/`) as the only call site of GIS `renderButton` (standard theme, `size: 'large'`, container width up to 400px).
- [ ] Render nothing (only a console warning) when the GIS guard fails (client ID absent).
- [ ] Add an `onError(error)` prop reporting script-load failures from the loader.

## 6. Cross-Account Chat-State Isolation

- [ ] Extract the authenticated portion of `ChatPage` (`app/chat/page.tsx:21–103`: `chatId` state, `useStreamingResponse`/`useProfilePhoto` usage, header, chat main area) into an `AuthenticatedChat` component.
- [ ] Render `<AuthenticatedChat key={authIdentityKey} …/>` only when `authIdentityKey` is non-null.
- [ ] Add a cleanup effect in `useStreamingResponse` that closes the SSE connection / aborts in-flight fetches on unmount (using existing `closeConnection` if available).
- [ ] Add a shared `chatHistoryQueryKey(authIdentityKey, chatId)` helper (in `app/chat/utils/` or alongside the hooks).
- [ ] Replace the `['chat', chatId]` query key in `useFetchChatHistory.ts:58` with the namespaced helper.
- [ ] Replace all `queryClient` read/write calls in `useStreamingResponse.ts` and `useSendMessage.ts` that use `['chat', chatId]` with the namespaced helper.
- [ ] Add an `IdentityCacheReset` component rendered in `app/layout.tsx` as the first child of `TanStackQueryProvider`, sibling above `ReduxProvider`.
- [ ] Implement `IdentityCacheReset` to consume `authIdentityKey` from context and call `queryClient.removeQueries({ queryKey: ['chat'] })` on any change, including transitions to `null` at logout.
- [ ] Add a regression test: populate account A's chat cache and start a stream, switch explicitly to account B, assert no A message renders, no request carries A's `chatId` with B's bearer, A's stream is closed, and A's cache entries are removed.

## 7. Google Token Renewal

- [ ] Implement the renewal spike: GIS initialized with `auto_select: true`; credential callback (post rule-4 identity-pin check) swaps the fresh ID token into shared state.
- [ ] Implement the pre-expiry renewal timer firing ~5 minutes before the active token's `exp`, invoking the shared `requestGoogleCredential()` routine.
- [ ] Evaluate the spike against the gate (routine >1h chat session without an interactive prompt for a user with an active Google session) and record the outcome in the PR description.
- [ ] Implement the non-blocking, accessible re-auth banner shown when renewal is suppressed or returns a rejected (mismatched-`sub`, automatic) credential, displayed while the current token is still valid.
- [ ] Gate chat on the explicit sign-in state only after the token fully expires (never a silent failure or silent identity switch).
- [ ] Add fake-timer tests: renewal success propagates to all consumers with no remount; renewal suppressed shows banner; renewal with mismatched `sub` shows banner; full expiry produces the gated state.

## 8. Profile Photo Provider Isolation

- [ ] Make `lib/auth/useProfilePhoto.ts` provider-aware via the shared auth context instead of calling `useMsal()` directly.
- [ ] Skip Microsoft Graph entirely (no `acquireTokenSilent`, no Graph fetch, `photoUrl: null`) unless the state is resolved and the active provider is an authenticated Microsoft session.
- [ ] Revoke and clear any prior Microsoft photo object URL on provider transitions (Google login after Microsoft, account switch, sign-out) within the hook's own unmount/identity-change cleanup.
- [ ] Verify `app/chat/page.tsx` and `app/chat/components/MessageList.tsx` show no Microsoft-specific copy or errors for Google users when `photoUrl` is `null`.
- [ ] Add a test: with an MSAL account cached but the active provider `google`, no MSAL token acquisition and no Graph request occurs.

## 9. Server-Side Validation Dispatch

- [ ] Add `server/middleware/google-auth.ts` validating Google ID tokens via `jose` against `https://www.googleapis.com/oauth2/v3/certs`.
- [ ] Pin the accepted signing algorithm to `RS256` in the Google validator.
- [ ] Accept both documented Google issuer forms: `https://accounts.google.com` and `accounts.google.com`.
- [ ] Validate audience equals the Google client ID and require `email_verified === true`.
- [ ] Export a Microsoft issuer predicate from `server/middleware/msal-auth.ts` (or a shared module) that reads the same `TENANT_ID` resolution used by `validateMsalToken` (`msal-auth.ts:36–39`).
- [ ] Implement the predicate for configured-tenant mode: accept exactly `https://login.microsoftonline.com/<TENANT_ID>/v2.0`.
- [ ] Implement the predicate for `common` mode: accept any issuer matching `https://login.microsoftonline.com/<single non-empty path segment>/v2.0`.
- [ ] Add a dispatcher at the `getSessionFromJwtFallback` call site (`session.ts:82`) that performs an unverified decode of `iss` and routes to the Google validator, the Microsoft validator, or rejects with 401 before any validator runs.
- [ ] Ensure tokens matching neither the Google issuer allowlist nor the Microsoft predicate are rejected 401 with neither validator invoked.
- [ ] Normalize the Microsoft identity unchanged: `userId = oid` raw, `email = preferred_username`, `name = name`.
- [ ] Normalize the Google identity: `userId = 'google:' + sub`, requiring non-empty `sub` and `email` (reject otherwise), `name` falling back to the email local part.
- [ ] Verify (by test, no code change) that `getMsalTokenFromRequest` and `server/middleware/csrf.ts` work unmodified for Google bearers (CSRF keys off the `jwt-fallback:` session-ID prefix and hashes the raw bearer).

## 10. Landing Page UI

- [ ] In `components/landing/LandingSignInButton.tsx`, render the shared `GoogleSignInButton` first/top and the existing "Sign in with Microsoft" button below with secondary styling.
- [ ] While `status === 'resolving'`, render a loading treatment with both login actions disabled.
- [ ] Preserve the existing loading spinner, shared `role="alert"`/`aria-live` error region, and focus rings.
- [ ] Ensure the self-styled Microsoft button keeps the existing ≥44px (`min-h-11`) touch target.
- [ ] Ensure DOM order matches visual order (Google above Microsoft) so tab order matches prominence.

## 11. Chat Auth Gate UI

- [ ] In `app/chat/components/ChatSignInPrompt.tsx`, apply the same two-option, Google-first layout using the shared `GoogleSignInButton`.
- [ ] Apply the same `resolving`-status loading/disabled treatment as the landing page.
- [ ] Change the `onLogin` prop to `onLogin(provider)`.

## 12. Strings

- [ ] Add Google sign-in strings to `lib/constants/strings.ts`.
- [ ] Update `landing.primaryCta` handling for the two-option layout.
- [ ] Make Microsoft-specific copy (`chat.authPrompt.description`, `auth.disclaimer`) provider-neutral.
- [ ] Add re-auth banner copy.
- [ ] Add a Google script-load-failure message and a retry-action label.

## 13. Sign-Out

- [ ] Keep Microsoft `logoutPopup` unchanged and additionally set the persisted marker to `'signed-out'`.
- [ ] Implement Google logout: clear shared credential state and `sub`, clear `lastGoogleSub`, cancel the renewal timer, call `google.accounts.id.disableAutoSelect()`, set marker to `'signed-out'`, revoke any lingering photo object URL.
- [ ] Verify the `authIdentityKey` transition to `null` on logout drives the `IdentityCacheReset` cache purge.
- [ ] Add a test confirming a still-cached MSAL account does not re-authenticate the user after Google logout.

## 14. Error and Cancellation Handling

- [ ] Treat GIS popup/One Tap dismissal as cancellation with no rendered error alert (mirroring MSAL `user_cancelled` handling).
- [ ] Wire `GoogleSignInButton`'s `onError` prop to the loader's load-failure rejection.
- [ ] In `LandingSignInButton` and `ChatSignInPrompt`, render the load-failure string in the existing `role="alert"` region together with an explicit "Retry" control (≥44px) that clears the error and re-attempts the load via the loader's failed-load reset.
- [ ] Verify the Microsoft option remains fully functional while a Google load-failure error is displayed.
- [ ] Route invalid-credential and server-401 failures through the same error region.

## 15. Tests

- [ ] Extend `__tests__/lib/auth/useAuth.test.tsx` for provider switching, Google login/logout, renewal timer, suppressed-renewal banner, expiry, and reload rules.
- [ ] Add `AuthProvider` tests: shared credential across all consumers; refresh propagation without remount; single guarded `initialize()` call.
- [ ] Add bootstrap-resolution tests: reload with marker `'signed-out'` + cached MSAL account; reload with marker `'google'` + cached MSAL account; reload with marker absent + cached MSAL account — each asserting no pre-resolution selection, restoration, network activity, or authenticated UI, and correct post-resolution behavior.
- [ ] Add a test asserting `status === 'resolving'` is exposed to consumers during the pre-resolution window.
- [ ] Add the real-provider-ordering integration test: real `MsalProvider` + `AuthProvider` with `@azure/msal-browser` mocked underneath (cached accounts, controllable `handleRedirectPromise`, controllable event emission), asserting markers `'google'`/`'signed-out'` never trigger selection, marker-absent selects only post-resolution, a pending redirect result is selected post-resolution as an explicit Microsoft login, a real `LOGIN_SUCCESS` event produces no event-callback selection (facade selects exactly once, marker-before-selection), and a StrictMode-style remount does not reprocess the consumed redirect result.
- [ ] Add restoration-trigger tests: `prompt()` invoked exactly once when marker is `'google'` + `lastGoogleSub` present; not invoked when `lastGoogleSub` is missing or marker is absent/`'microsoft'`/`'signed-out'`; matching automatic credential restores; mismatching automatic credential and suppressed/never-arriving prompt both leave the user unauthenticated without error.
- [ ] Add a test: Google login succeeds with an MSAL account cached in the browser.
- [ ] Add a test: an in-session credential with a different `sub` and `select_by: 'auto'` (and an unknown/unlisted `select_by`) is rejected to the banner path; the same credential with an allowlisted gesture value performs an account switch changing `authIdentityKey`.
- [ ] Add the cross-account isolation regression test from Section 6, including `IdentityCacheReset` purge on identity change and logout, and query-key namespacing unit coverage.
- [ ] Add `useProfilePhoto` isolation tests, including the resolving state.
- [ ] Add server tests alongside `__tests__/server/middleware/msal-auth.test.ts` for Google validation: wrong audience, expired, wrong issuer, wrong/`none` algorithm, both accepted issuer forms, unverified email, missing `sub`/`email`, malformed/undecodable JWT.
- [ ] Add issuer-dispatch tests for both tenancy modes (configured-tenant: foreign tenant rejected 401 with no validator/JWKS call; `common`: arbitrary Entra-shaped issuer routes to Microsoft validator, non-Entra/non-Google issuer rejected before validation) using env stubbing with `jest.isolateModules`/module reset given `jest.setup.ts:36–37` pins `TENANT_ID`.
- [ ] Add a test confirming Microsoft `userId` format is unchanged.
- [ ] Add a rotation test: two consecutive state-changing requests with different renewed valid Google tokens both pass CSRF and ownership checks.
- [ ] Add CSP directive assertions in `__tests__/unit/proxy.security.test.ts`.
- [ ] Update `__tests__/app/chat/page.test.tsx` and landing tests for the two-button layout/ordering and the `AuthenticatedChat` extraction.
- [ ] Update `e2e/utils/testAuth.ts` and affected e2e specs.

## 16. Documentation

- [ ] Update `README.md` auth setup with Google console steps (JavaScript origins per environment, callback mode, no redirect URIs).
- [ ] Document the new environment variables.
- [ ] Document the best-effort renewal/degradation behavior.
- [ ] Document sign-out/provider-transition semantics, including `lastGoogleSub`, the single-shot restoration prompt, bootstrap resolution, and the deferred MSAL account-selection ownership (controller + facade as the only two selection sites).
- [ ] Document the issuer-dispatch rule, including the explicit Microsoft tenancy policy (configured-tenant pins one issuer; `common` mode preserves today's any-Entra-tenant acceptance, with a recommendation to configure a specific tenant and a follow-up note on tightening).
- [ ] Add the staging smoke checklist to the documentation.

## 17. Staging Smoke Checklist (Manual, Documented in PR)

- [ ] Verify real Google login on staging with authorized origins, deployed CSP, and console configuration.
- [ ] Verify sign-out, including that a cached Microsoft account does not resurrect the session after Google logout, and that a reload after sign-out shows no authenticated flash.
- [ ] Verify a send-message round trip works for a Google-authenticated user.
- [ ] Verify a reload mid-session: the restoration prompt fires once and automatically restores the same account when Google's session conditions allow; when suppressed, the user lands on the sign-in surface with no error and signs back in explicitly.
- [ ] Verify a normal Microsoft popup login completes with facade-owned selection.
- [ ] Verify a Microsoft popup-blocked redirect login completes end-to-end (marker persisted pre-redirect, account selected post-return).
- [ ] Verify an account switch via the Google button shows no prior account's chat.
- [ ] Verify the re-auth banner degradation path appears before token expiry when renewal is suppressed.

---

## Verification

- [ ] Run the full unit test suite and confirm all new and existing tests pass, including: `useAuth`/`AuthProvider` state-machine and bootstrap-resolution tests, the real-provider-ordering `MsalProvider`+`AuthProvider` integration test, cross-account isolation regression test, `useProfilePhoto` isolation tests, GIS loader lifecycle tests, server `msal-auth`/`google-auth` dispatch tests (both tenancy modes), CSRF rotation test, and CSP directive assertions in `__tests__/unit/proxy.security.test.ts`.
- [ ] Confirm existing MSAL unit tests pass unmodified in behavior (no regressions to Microsoft login).
- [ ] Grep `lib/auth/MsalProvider.tsx` to confirm zero `setActiveAccount` calls remain.
- [ ] Run `__tests__/app/chat/page.test.tsx` and landing page tests to confirm the two-button, Google-first layout and DOM/tab order.
- [ ] Run e2e specs (`e2e/utils/testAuth.ts` and affected specs) to confirm Google and Microsoft flows both pass.
- [ ] Manually verify in a browser: landing page and chat gate both show Google above/before Microsoft, Google button meets GIS branding requirements, Microsoft button keeps ≥44px touch target.
- [ ] Manually verify Google sign-in reaches `/chat` and supports history load, send, and streaming.
- [ ] Manually verify Microsoft sign-in (popup and popup-blocked redirect) is unaffected.
- [ ] Manually verify sign-out, account switching, and cross-account isolation (no leaked chat data between accounts).
- [ ] Manually verify error/cancellation handling: dismissed Google prompt shows no error; a forced script-load failure shows the error region with a working Retry control while Microsoft remains usable.
- [ ] Confirm no secrets are committed and new env vars are documented in `types/env.d.ts` and `.env` examples.
- [ ] Run the full staging smoke checklist (Section 17) and record the renewal-spike gate outcome in the PR description.
- [ ] Run lint and build and confirm both succeed.
