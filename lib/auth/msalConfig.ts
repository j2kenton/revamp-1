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
const chatApiScope = process.env.NEXT_PUBLIC_AZURE_AD_CHAT_SCOPE ?? '';

if (!azureClientId) {
  throw new Error(
    'NEXT_PUBLIC_AZURE_AD_CLIENT_ID is not configured. Set NEXT_PUBLIC_AZURE_AD_CLIENT_ID (or AZURE_AD_CLIENT_ID) in your environment to enable Microsoft login.',
  );
}

if (!chatApiScope) {
  throw new Error(
    'NEXT_PUBLIC_AZURE_AD_CHAT_SCOPE is not configured. Provide the custom API scope (e.g., api://<app-id>/chat.Access) so MSAL can request tokens for your backend.',
  );
}

// Limit base scopes to identity-only resources. Resource-specific scopes (e.g., Microsoft Graph)
// must be requested separately to avoid mixing audiences in a single token.
const baseScopes = ['openid', 'profile', 'email'] as const;

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
  scopes: [...baseScopes, chatApiScope],
};

// Scopes for token request
export const tokenRequest = {
  scopes: [chatApiScope],
};

// Silent request configuration
export const silentRequest = {
  scopes: [...baseScopes, chatApiScope],
  forceRefresh: false,
};
