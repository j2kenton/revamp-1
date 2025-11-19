/**
 * Profile Photo Hook
 * Fetches user's profile photo from Microsoft Graph API
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { isBypassAuthEnabled } from '@/lib/auth/bypass';

interface UseProfilePhotoReturn {
  photoUrl: string | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const GRAPH_PHOTO_ENDPOINT = 'https://graph.microsoft.com/v1.0/me/photo/$value';
const GRAPH_SCOPES = ['User.Read'];

export function useProfilePhoto(): UseProfilePhotoReturn {
  const { instance, accounts, inProgress } = useMsal();
  const bypassAuth = isBypassAuthEnabled();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPhoto = useCallback(async () => {
    if (bypassAuth) {
      // Return null for bypass auth - no photo available
      return;
    }

    if (inProgress !== InteractionStatus.None) {
      return;
    }

    const account = instance.getActiveAccount();
    if (!account) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Acquire token specifically for Graph API
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: GRAPH_SCOPES,
        account,
      });

      const response = await fetch(GRAPH_PHOTO_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${tokenResponse.accessToken}`,
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
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
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
  }, [instance, inProgress, bypassAuth, photoUrl]);

  // Fetch photo on mount when authenticated
  useEffect(() => {
    if (bypassAuth) {
      return;
    }

    if (
      accounts.length > 0 &&
      inProgress === InteractionStatus.None &&
      !photoUrl
    ) {
      fetchPhoto();
    }
  }, [accounts.length, inProgress, bypassAuth, photoUrl, fetchPhoto]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }
    };
  }, [photoUrl]);

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
