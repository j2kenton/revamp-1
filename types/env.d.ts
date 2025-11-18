/**
 * Type definitions for environment variables.
 * Provides type safety when accessing process.env variables.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // NextAuth
    NEXTAUTH_SECRET: string;
    NEXTAUTH_URL: string;

    // OAuth Providers (Optional)
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GITHUB_ID?: string;
    GITHUB_SECRET?: string;

    // Database (Optional)
    DATABASE_URL?: string;

    // Redis
    REDIS_URL?: string;
    REDIS_HOST?: string;
    REDIS_PORT?: string;
    REDIS_PASSWORD?: string;
    REDIS_TLS?: string;
    MOCK_REDIS?: string;
    BYPASS_AUTH?: string;
    NEXT_PUBLIC_BYPASS_AUTH?: string;
    TEST_AUTH_MODE?: string;
    NEXT_PUBLIC_TEST_AUTH_MODE?: string;
    AZURE_AD_CLIENT_ID?: string;
    AZURE_AD_TENANT_ID?: string;
    AZURE_AD_REDIRECT_URI?: string;
    AZURE_AD_POST_LOGOUT_REDIRECT_URI?: string;
    AZURE_AD_CHAT_SCOPE?: string;
    NEXT_PUBLIC_AZURE_AD_CLIENT_ID?: string;
    NEXT_PUBLIC_AZURE_AD_TENANT_ID?: string;
    NEXT_PUBLIC_REDIRECT_URI?: string;
    NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI?: string;
    NEXT_PUBLIC_AZURE_AD_CHAT_SCOPE?: string;

    // Node Environment
    NODE_ENV: 'development' | 'production' | 'test';

    // API Configuration
    API_TIMEOUT?: string;
    MAX_REQUEST_SIZE?: string;

    // Feature Flags
    ENABLE_RATE_LIMITING?: string;
    ENABLE_CSRF_PROTECTION?: string;

    // External Services
    SENTRY_DSN?: string;
    VERCEL_ANALYTICS_ID?: string;
  }
}
