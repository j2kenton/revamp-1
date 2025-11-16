/**
 * Connection Status Component
 * Shows WebSocket/SSE connection state
 */

'use client';

import { useState, useEffect } from 'react';
import clsx from 'clsx';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';

export function ConnectionStatus() {
  const [status, setStatus] = useState<ConnectionState>('connected');

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setStatus('connected');
    const handleOffline = () => setStatus('disconnected');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial status
    setStatus(navigator.onLine ? 'connected' : 'disconnected');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (status === 'connected') {
    return null; // Don't show anything when connected
  }

  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
        {
          'bg-yellow-100 text-yellow-800': status === 'connecting',
          'bg-red-100 text-red-800': status === 'disconnected',
        }
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={clsx('h-2 w-2 rounded-full', {
          'animate-pulse bg-yellow-500': status === 'connecting',
          'bg-red-500': status === 'disconnected',
        })}
      />
      <span>
        {status === 'connecting' && 'Connecting...'}
        {status === 'disconnected' && 'Disconnected'}
      </span>
    </div>
  );
}
