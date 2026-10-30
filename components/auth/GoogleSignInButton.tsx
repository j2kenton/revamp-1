/**
 * GoogleSignInButton
 * The single call site for Google Identity Services' `renderButton`. Renders
 * nothing (only a console warning) when Google sign-in isn't configured.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useGoogleAuth } from '@/lib/auth/GoogleAuthProvider';
import { isBypassAuthEnabled } from '@/lib/auth/bypass';

interface GoogleSignInButtonProps {
  onError?: (error: Error) => void;
  className?: string;
}

/** GIS `renderButton` accepts an explicit pixel width up to this maximum. */
const GIS_MAX_BUTTON_WIDTH = 400;
/** Used when the container has no measurable width yet (e.g. hidden ancestor). */
const GIS_FALLBACK_BUTTON_WIDTH = 320;

export function GoogleSignInButton({ onError, className }: GoogleSignInButtonProps) {
  const { isConfigured, ensureInitialized } = useGoogleAuth();
  const bypassAuth = isBypassAuthEnabled();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);
  const isVisible = isConfigured && !bypassAuth;

  useEffect(() => {
    if (bypassAuth) {
      return;
    }

    if (!isConfigured) {
      console.warn(
        '[GoogleSignInButton] NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured; hiding the Google sign-in option.',
      );
      return;
    }

    let cancelled = false;

    ensureInitialized()
      .then(() => {
        if (cancelled || renderedRef.current || !containerRef.current) {
          return;
        }
        const measuredWidth = containerRef.current.clientWidth;
        const width = measuredWidth > 0
          ? Math.min(measuredWidth, GIS_MAX_BUTTON_WIDTH)
          : GIS_FALLBACK_BUTTON_WIDTH;

        window.google?.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width,
        });
        renderedRef.current = true;
      })
      .catch((error: Error) => {
        if (!cancelled) {
          onError?.(error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bypassAuth, isConfigured, ensureInitialized, onError]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      // `w-full max-w-[400px]` gives the container a concrete, layout-computed
      // width (GIS's own maximum) even when an ancestor is a shrink-to-fit
      // flex item — without it, an empty container measures 0 until GIS
      // populates it, and `renderButton`'s `width` would always fall back.
      className={className ? `w-full max-w-[400px] ${className}` : 'w-full max-w-[400px]'}
      data-testid="google-signin-button"
    />
  );
}
