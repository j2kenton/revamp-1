/**
 * useSubmitDebounce
 * Locks for `delayMs` after `lock()` is called, guarding against rapid
 * repeat submissions
 */

'use client';

import { useEffect, useRef, useState } from 'react';

export function useSubmitDebounce(delayMs: number) {
  const [isLocked, setIsLocked] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const lock = () => {
    setIsLocked(true);
    timeoutRef.current = setTimeout(() => {
      setIsLocked(false);
    }, delayMs);
  };

  return { isLocked, lock };
}
