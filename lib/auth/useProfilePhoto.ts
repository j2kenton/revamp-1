/**
 * Profile Photo Hook
 * Fetches user's profile photo from Microsoft Graph API. Skipped entirely
 * for Google-authenticated sessions — there is no Graph token to acquire,
 * and any previously-fetched Microsoft photo is revoked on the transition.
 *
 * Mediated entirely through `useAuth()`'s `acquireGraphToken` rather than
 * calling `useMsal()`/`acquireTokenSilent` directly — `AuthProvider` is the
 * single owner of MSAL account selection and token acquisition; this hook
 * has no MSAL SDK access of its own.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isBypassAuthEnabled } from '@/lib/auth/bypass';
import { useAuth } from '@/lib/auth/useAuth';

interface UseProfilePhotoReturn {
  photoUrl: string | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const GRAPH_PHOTO_ENDPOINT = 'https://graph.microsoft.com/v1.0/me/photo/$value';
const GRAPH_SCOPES = ['User.Read'];

export function useProfilePhoto(): UseProfilePhotoReturn {
  const { provider, acquireGraphToken } = useAuth();
  const bypassAuth = isBypassAuthEnabled();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const photoUrlRef = useRef<string | null>(null);

  useEffect(() => {
    photoUrlRef.current = photoUrl;
  }, [photoUrl]);

  const isMicrosoftSession = provider === 'microsoft';

  const fetchPhoto = useCallback(async () => {
    if (bypassAuth) {
      // Return null for bypass auth - no photo available
      return;
    }

    if (!isMicrosoftSession) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Acquire token specifically for Graph API
      const accessToken = await acquireGraphToken(GRAPH_SCOPES);
      if (!accessToken) {
        return;
      }

      const response = await fetch(GRAPH_PHOTO_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // User doesn't have a profile photo - this is not an error
          setPhotoUrl(null);
          return;
        }

        // Try to parse error response for specific error codes
        try {
          const errorData = await response.json();
          const errorCode = errorData?.error?.code;

          // Handle specific Microsoft Graph errors that indicate no photo is available
          if (
            errorCode === 'ErrorNonExistentStorage' ||
            errorCode === 'ImageNotFound' ||
            errorCode === 'ResourceNotFound'
          ) {
            // These errors mean the user's account doesn't support profile photos
            // or no photo has been set - not a real error
            setPhotoUrl(null);
            return;
          }
        } catch {
          // If we can't parse the error, continue with generic error handling
        }

        throw new Error(`Failed to fetch profile photo: ${response.status}`);
      }

      const blob = await response.blob();

      // Revoke previous URL if exists to prevent memory leaks
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current);
      }

      const url = URL.createObjectURL(blob);
      setPhotoUrl(url);
    } catch (err) {
      console.error('Failed to fetch profile photo:', err);
      setError(err as Error);
      setPhotoUrl(null);
    } finally {
      setIsLoading(false);
    }
  }, [acquireGraphToken, bypassAuth, isMicrosoftSession]);

  // Fetch photo on mount when authenticated with Microsoft
  useEffect(() => {
    if (bypassAuth || !isMicrosoftSession) {
      return;
    }

    if (!photoUrlRef.current) {
      fetchPhoto();
    }
  }, [bypassAuth, isMicrosoftSession, fetchPhoto]);

  // Revoke and clear any Microsoft photo when the session is no longer
  // Microsoft (Google login, account switch, or sign-out).
  useEffect(() => {
    if (!isMicrosoftSession && photoUrlRef.current) {
      URL.revokeObjectURL(photoUrlRef.current);
      setPhotoUrl(null);
    }
  }, [isMicrosoftSession]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current);
      }
    };
  }, []);

  if (bypassAuth) {
    return {
      photoUrl: null,
      isLoading: false,
      error: null,
      refetch: async () => {},
    };
  }

  return {
    photoUrl,
    isLoading,
    error,
    refetch: fetchPhoto,
  };
}
