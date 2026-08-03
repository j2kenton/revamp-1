/**
 * useCountdown
 * Ticks a countdown down to zero once per second, reseeded whenever
 * `seconds` changes
 */

'use client';

import { useEffect, useState } from 'react';

const COUNTDOWN_INTERVAL_MS = 1000;
const MIN_COUNTDOWN_VALUE = 1;
const IMMEDIATE_TIMEOUT_MS = 0;

export function useCountdown(
  seconds: number | null | undefined,
): number | null {
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    const nextCountdown = typeof seconds === 'number' ? seconds : null;

    let frameId: number | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    if (typeof window === 'undefined') {
      timeoutId = setTimeout(
        () => setCountdown(nextCountdown),
        IMMEDIATE_TIMEOUT_MS,
      );
    } else {
      frameId = window.requestAnimationFrame(() => {
        setCountdown(nextCountdown);
      });
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [seconds]);

  useEffect(() => {
    if (countdown === null) {
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => {
        if (prev === null) {
          return null;
        }
        if (prev <= MIN_COUNTDOWN_VALUE) {
          return null;
        }
        return prev - 1;
      });
    }, COUNTDOWN_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [countdown]);

  return countdown;
}
