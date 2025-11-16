/**
 * MSAL Provider Component
 * Wraps the application with Microsoft Authentication Library context
 */

'use client';

import { ReactNode, useEffect, useState } from 'react';
import { PublicClientApplication, EventType, EventMessage, AuthenticationResult } from '@azure/msal-browser';
import { MsalProvider as MsalReactProvider } from '@azure/msal-react';
import { msalConfig } from './msalConfig';

interface MsalProviderProps {
  children: ReactNode;
}

// Create MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

export function MsalProvider({ children }: MsalProviderProps) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const initializeMsal = async () => {
      try {
        await msalInstance.initialize();

        // Account selection logic is app dependent. Adjust as needed for your use case.
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          msalInstance.setActiveAccount(accounts[0]);
        }

        // Listen for sign-in event and set active account
        msalInstance.addEventCallback((event: EventMessage) => {
          if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const payload = event.payload as AuthenticationResult;
            const account = payload.account;
            msalInstance.setActiveAccount(account);
          }
        });

        setInitialized(true);
      } catch (error) {
        console.error('Failed to initialize MSAL:', error);
      }
    };

    initializeMsal();
  }, []);

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 mx-auto"></div>
          <p className="text-gray-600">Initializing authentication...</p>
        </div>
      </div>
    );
  }

  return <MsalReactProvider instance={msalInstance}>{children}</MsalReactProvider>;
}

export { msalInstance };
