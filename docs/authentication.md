# MSAL Authentication Flow

This document describes the MSAL-based authentication flow in the application.

## Overview

The application uses the Microsoft Authentication Library (MSAL) to authenticate users against Azure Active Directory (Azure AD). The authentication flow is as follows:

1. The user navigates to the login page.
2. The user clicks the "Sign in with Microsoft" button.
3. The application redirects the user to the Microsoft login page.
4. The user enters their Microsoft credentials.
5. Microsoft redirects the user back to the application with an authentication code.
6. The application uses the authentication code to obtain an access token and a refresh token from Azure AD.
7. The application stores the access token in memory and the refresh token in an encrypted httpOnly cookie.
8. The application creates a session for the user in Redis.
9. The application redirects the user to the dashboard.

## Frontend Integration

- `app/layout.tsx` wraps the entire tree with `MsalProvider`, `SessionProvider`, TanStack Query, and Redux so every client component has access to the active MSAL instance.
- `lib/auth/MsalProvider.tsx` boots a singleton `PublicClientApplication`, restores cached accounts, and listens for MSAL events to keep the active account in sync.
- `lib/auth/useAuth.ts` exposes `login`, `logout`, and `acquireToken`. It automatically refreshes tokens when they are about to expire (5‑minute buffer) and retries transient failures with exponential backoff. The hook also emits the derived CSRF token (see below) so API clients can attach it alongside the `Authorization` header.
- Client requests attach both headers:
  - `Authorization: Bearer <MSAL access token>`
  - `X-CSRF-Token: SHA-256 hash of the MSAL access token` (generated via `lib/auth/csrf.ts`)

## Token Refresh

Access tokens are short-lived and expire after about an hour. The application automatically refreshes the access token in the background using the refresh token. This ensures that the user remains logged in without having to re-enter their credentials.

The token refresh logic is implemented in the `lib/auth/useAuth.ts` file. The `useAuth` hook checks if the access token is about to expire and, if so, uses the refresh token to obtain a new access token.

## Session Management and Redis Failover

The application uses Redis to store user sessions. When a user logs in, the application creates a session for the user in Redis. The session contains the user's ID, email, and name.

The session management logic is implemented in the `lib/redis/session.ts` file. The `createSession` function creates a new session for the user in Redis. The `getSession` function retrieves a session from Redis. The `deleteSession` function deletes a session from Redis.

If Redis becomes unavailable, `server/middleware/session.ts` now falls back to validating the caller's MSAL JWT directly (via `validateMsalToken`). A deterministic CSRF token is derived from the access token (`SHA-256` of the JWT), allowing `server/middleware/csrf.ts` to continue enforcing CSRF protection even when Redis cannot be reached.

## Middleware

The application uses middleware to protect routes that require authentication. The `server/middleware/session.ts` file contains the session middleware. The session middleware checks if the user is authenticated and, if not, redirects the user to the login page.
