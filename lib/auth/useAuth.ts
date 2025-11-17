/**
 * Authentication Hook
 * Provides MSAL authentication functionality with automatic token refresh
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import {
  InteractionRequiredAuthError,
  InteractionStatus,
  SilentRequest,
  AuthenticationResult
} from '@azure/msal-browser';
import { BYPASS_ACCESS_TOKEN, isBypassAuthEnabled } from '@/lib/auth/bypass';
import { loginRequest, silentRequest } from './msalConfig';

interface UseAuthReturn {
  isAuthenticated: boolean;
  user: {
    id: string;
    email: string;
    name: string;
  } | null;
  accessToken: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  acquireToken: () => Promise<string | null>;
  isLoading: boolean;
  error: Error | null;
}

const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes in milliseconds
export function useAuth(): UseAuthReturn {
  const msalContext = useMsal();
  const { instance, accounts, inProgress } = msalContext;
  const bypassAuth = isBypassAuthEnabled();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const bypassUser = {
    id: 'bypass-user',
    email: 'test-user@example.com',
    name: 'Test User',
  } as const;

  const isAuthenticated = accounts.length > 0;
  const user = isAuthenticated && accounts[0]
    ? {
        id: accounts[0].localAccountId,
        email: accounts[0].username,
        name: accounts[0].name || accounts[0].username,
      }
    : null;

  /**
   * Acquire access token silently with automatic retry
   */
  const acquireToken = useCallback(async (retryCount = 0): Promise<string | null> => {
    if (bypassAuth) {
      return BYPASS_ACCESS_TOKEN;
    }

    if (inProgress !== InteractionStatus.None) {
      return null;
    }

    const account = instance.getActiveAccount();
    if (!account) {
      return null;
    }

    try {
      const request: SilentRequest = {
        ...silentRequest,
        account,
      };

      const response: AuthenticationResult = await instance.acquireTokenSilent(request);

      setAccessToken(response.accessToken);
      // Set expiry time with buffer
      if (response.expiresOn) {
        setTokenExpiresAt(response.expiresOn.getTime() - TOKEN_EXPIRY_BUFFER);
      }
      setError(null);

      return response.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        // Token expired or requires interaction - try to acquire interactively
        try {
          const response = await instance.acquireTokenPopup(loginRequest);
          setAccessToken(response.accessToken);
          if (response.expiresOn) {
            setTokenExpiresAt(response.expiresOn.getTime() - TOKEN_EXPIRY_BUFFER);
          }
          setError(null);
          return response.accessToken;
        } catch (interactiveError) {
          console.error('Interactive token acquisition failed:', interactiveError);
          setError(interactiveError as Error);
          return null;
        }
      } else {
        // Network or other error - retry with exponential backoff
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay));
          return acquireToken(retryCount + 1);
        }

        console.error('Token acquisition failed:', err);
        setError(err as Error);
        return null;
      }
    }
  }, [instance, inProgress, bypassAuth]);

  /**
   * Login with popup
   */
  const login = useCallback(async () => {
    if (bypassAuth) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await instance.loginPopup(loginRequest);
      instance.setActiveAccount(response.account);
      setAccessToken(response.accessToken);
      if (response.expiresOn) {
        setTokenExpiresAt(response.expiresOn.getTime() - TOKEN_EXPIRY_BUFFER);
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [instance, bypassAuth]);

  /**
   * Logout
   */
  const logout = useCallback(async () => {
    if (bypassAuth) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const account = instance.getActiveAccount();
      await instance.logoutPopup({
        account,
        postLogoutRedirectUri: '/login',
      });
      setAccessToken(null);
      setTokenExpiresAt(null);
    } catch (err) {
      console.error('Logout failed:', err);
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [instance, bypassAuth]);

  /**
   * Proactive token refresh before expiration
   */
  useEffect(() => {
    if (bypassAuth || !isAuthenticated || !tokenExpiresAt) {
      return;
    }

    const checkAndRefresh = async () => {
      const now = Date.now();
      if (now >= tokenExpiresAt) {
        // Token is about to expire, refresh it
        await acquireToken();
      }
    };

    // Check every minute
    const interval = setInterval(checkAndRefresh, 60 * 1000);

    // Also check immediately
    checkAndRefresh();

    return () => clearInterval(interval);
  }, [bypassAuth, isAuthenticated, tokenExpiresAt, acquireToken]);

  /**
   * Acquire initial token on mount
   */
  useEffect(() => {
    if (bypassAuth) {
      return;
    }

    if (isAuthenticated && !accessToken && inProgress === InteractionStatus.None) {
      acquireToken();
    }
  }, [bypassAuth, isAuthenticated, accessToken, inProgress, acquireToken]);

  if (bypassAuth) {
    const noop = async () => {};
    return {
      isAuthenticated: true,
      user: bypassUser,
      accessToken: BYPASS_ACCESS_TOKEN,
      login: noop,
      logout: noop,
      acquireToken: async () => BYPASS_ACCESS_TOKEN,
      isLoading: false,
      error: null,
    };
  }

  return {
    isAuthenticated,
    user,
    accessToken,
    login,
    logout,
    acquireToken,
    isLoading: isLoading || inProgress !== InteractionStatus.None,
    error,
  };
}
