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

## Token Refresh

Access tokens are short-lived and expire after about an hour. The application automatically refreshes the access token in the background using the refresh token. This ensures that the user remains logged in without having to re-enter their credentials.

The token refresh logic is implemented in the `lib/auth/useAuth.ts` file. The `useAuth` hook checks if the access token is about to expire and, if so, uses the refresh token to obtain a new access token.

## Session Management

The application uses Redis to store user sessions. When a user logs in, the application creates a session for the user in Redis. The session contains the user's ID, email, and name.

The session management logic is implemented in the `lib/redis/session.ts` file. The `createSession` function creates a new session for the user in Redis. The `getSession` function retrieves a session from Redis. The `deleteSession` function deletes a session from Redis.

## Middleware

The application uses middleware to protect routes that require authentication. The `server/middleware/session.ts` file contains the session middleware. The session middleware checks if the user is authenticated and, if not, redirects the user to the login page.
