# Outstanding Project Tasks (Updated)

This document summarizes the outstanding work required to complete the application, based on a re-check of the codebase. The core chat functionality is now implemented.

---

## Phase 0: Align Authentication with Spec

- **Status: Partially Implemented (with Critical Flaws)**

The following two critical items are the highest priority and are still outstanding:

- **[ ] CRITICAL FLAW:** Implement cryptographic signature verification for MSAL tokens on the server in `server/middleware/msal-auth.ts`. The current implementation only decodes tokens without verifying them, which is a major security vulnerability.
- **[ ] CRITICAL:** Implement MSAL token refresh logic on the frontend in `lib/auth/MsalProvider.tsx` or a related hook. Without this, users will be logged out every hour with no way to silently renew their session.
- **[ ]** Implement secure storage for refresh tokens (e.g., httpOnly cookies).
- **[ ]** Add proactive token expiry monitoring to trigger silent refreshes.

---

### Phase 4: Polish and Finalize

- **Status: Partially Implemented**

With the core features now in place, the remaining tasks are:

- **[ ]** **Accessibility:** Audit the new chat components (`ChatInput`, `ChatMessage`, etc.) for ARIA compliance, keyboard navigation, and color contrast.
- **[ ]** **Testing:** Write unit, integration, and E2E tests covering the new chat functionality and the authentication flow.
- **[ ]** **Documentation:** Rewrite `WALKTHROUGH.md` to accurately reflect the project's *current* state and features.
- **[ ]** **Monitoring:** Create the `/api/health` health check endpoint as specified in the roadmap.
- **[ ]** **Performance:** Implement Web Vitals monitoring and optimize the application bundle size.
