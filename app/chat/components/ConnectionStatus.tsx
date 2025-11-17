/**
 * Connection Status Component
 * Shows WebSocket/SSE connection state
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { STRINGS } from '@/lib/constants/strings';

type ConnectionState = 'online' | 'offline' | 'reconnecting';

const RECONNECT_DISPLAY_DURATION_MS = 2000;

interface StatusConfig {
  ariaLive: 'polite' | 'assertive';
  containerClass: string;
  indicatorClass: string;
  role: 'status' | 'alert';
}

const STATUS_CONFIG: Record<ConnectionState, StatusConfig> = {
  online: {
    ariaLive: 'polite',
    containerClass: 'bg-emerald-100 text-emerald-800',
    indicatorClass: 'bg-emerald-500',
    role: 'status',
  },
  reconnecting: {
    ariaLive: 'polite',
    containerClass: 'bg-yellow-100 text-yellow-800',
    indicatorClass: 'animate-pulse bg-yellow-500',
    role: 'status',
  },
  offline: {
    ariaLive: 'assertive',
    containerClass: 'bg-red-100 text-red-800',
    indicatorClass: 'bg-red-500',
    role: 'alert',
  },
};

const getInitialStatus = (): ConnectionState => {
  if (typeof window === 'undefined') {
    return 'online';
  }

  return window.navigator.onLine ? 'online' : 'offline';
};

export function ConnectionStatus() {
  const [status, setStatus] = useState<ConnectionState>(getInitialStatus);
  const statusRef = useRef<ConnectionState>(status); // Keep latest value for event callbacks
  const reconnectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const updateStatus = (nextStatus: ConnectionState) => {
      statusRef.current = nextStatus;
      setStatus(nextStatus);
    };

    const clearReconnectTimer = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const scheduleOnlineState = () => {
      reconnectTimeoutRef.current = window.setTimeout(() => {
        updateStatus('online');
        reconnectTimeoutRef.current = null;
      }, RECONNECT_DISPLAY_DURATION_MS);
    };

    const handleOnline = () => {
      clearReconnectTimer();
      const shouldShowRecovery =
        statusRef.current === 'offline' || statusRef.current === 'reconnecting';

      if (shouldShowRecovery) {
        updateStatus('reconnecting');
        scheduleOnlineState();
        return;
      }

      updateStatus('online');
    };

    const handleOffline = () => {
      clearReconnectTimer();
      updateStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearReconnectTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const statusConfig = STATUS_CONFIG[status];
  const primaryLabel =
    status === 'offline'
      ? STRINGS.connection.offline
      : STRINGS.connection.online;

  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
        statusConfig.containerClass,
      )}
      role={statusConfig.role}
      aria-live={statusConfig.ariaLive}
      aria-atomic="true"
    >
      <span
        aria-hidden="true"
        className={clsx('h-2 w-2 rounded-full', statusConfig.indicatorClass)}
      />
      <span>
        {primaryLabel}
        {status === 'reconnecting' && (
          <span className="ml-1 font-normal">
            ({STRINGS.connection.reconnecting})
          </span>
        )}
      </span>
    </div>
  );
}
