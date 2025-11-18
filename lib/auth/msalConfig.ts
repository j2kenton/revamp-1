/**
 * MSAL Configuration
 * Microsoft Authentication Library configuration for Azure AD authentication
 */

import { Configuration, PopupRequest } from '@azure/msal-browser';

const azureClientId = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID ?? '';
const azureTenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID ?? 'common';
const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? '/';
const postLogoutRedirectUri =
  process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? '/';

if (!azureClientId) {
  throw new Error(
    'NEXT_PUBLIC_AZURE_AD_CLIENT_ID is not configured. Set NEXT_PUBLIC_AZURE_AD_CLIENT_ID (or AZURE_AD_CLIENT_ID) in your environment to enable Microsoft login.',
  );
}

// MSAL configuration
export const msalConfig: Configuration = {
  auth: {
    clientId: azureClientId,
    authority: `https://login.microsoftonline.com/${azureTenantId}`,
    redirectUri,
    postLogoutRedirectUri,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: 'sessionStorage', // Use sessionStorage for security
    storeAuthStateInCookie: false, // Set to true for IE11 or Edge
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case 0: // LogLevel.Error
            console.error(message);
            return;
          case 1: // LogLevel.Warning
            console.warn(message);
            return;
          case 2: // LogLevel.Info
            console.info(message);
            return;
          case 3: // LogLevel.Verbose
            console.debug(message);
            return;
        }
      },
    },
  },
};

// Scopes for login request
export const loginRequest: PopupRequest = {
  scopes: ['User.Read', 'openid', 'profile', 'email'],
};

// Scopes for token request
export const tokenRequest = {
  scopes: ['User.Read'],
};

// Silent request configuration
export const silentRequest = {
  scopes: ['User.Read', 'openid', 'profile', 'email'],
  forceRefresh: false,
};
