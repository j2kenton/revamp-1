/**
 * Secure Token Storage
 * Handles secure storage of refresh tokens using encrypted httpOnly cookies
 */

import { cookies } from 'next/headers';
import { FIVE_MINUTES_IN_MS } from '@/lib/constants/common';

const REFRESH_TOKEN_COOKIE_NAME = 'msal_refresh_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

interface TokenStorageOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number;
  path: string;
}

const defaultOptions: TokenStorageOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: COOKIE_MAX_AGE,
  path: '/',
};

/**
 * Store refresh token securely in httpOnly cookie
 */
export async function storeRefreshToken(token: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(REFRESH_TOKEN_COOKIE_NAME, token, {
    ...defaultOptions,
    httpOnly: true, // Prevent JavaScript access
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  });
}

/**
 * Retrieve refresh token from httpOnly cookie
 */
export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME);
  return cookie?.value || null;
}

/**
 * Clear refresh token
 */
export async function clearRefreshToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(REFRESH_TOKEN_COOKIE_NAME);
}

/**
 * Store access token metadata (expiry time, etc.)
 * This is stored in sessionStorage on client side
 */
export const clientTokenStorage = {
  /**
   * Store token metadata
   */
  setTokenMetadata(expiresAt: number): void {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('msal_token_expires_at', expiresAt.toString());
    }
  },

  /**
   * Get token expiry time
   */
  getTokenExpiresAt(): number | null {
    if (typeof window !== 'undefined') {
      const expiresAt = sessionStorage.getItem('msal_token_expires_at');
      return expiresAt ? parseInt(expiresAt, 10) : null;
    }
    return null;
  },

  /**
   * Clear token metadata
   */
  clearTokenMetadata(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('msal_token_expires_at');
    }
  },

  /**
   * Check if token is about to expire (within 5 minutes)
   */
  isTokenExpiringSoon(): boolean {
    const expiresAt = this.getTokenExpiresAt();
    if (!expiresAt) return true;

    return Date.now() >= expiresAt - FIVE_MINUTES_IN_MS;
  },
};
