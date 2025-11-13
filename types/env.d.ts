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

    // Node Environment
    NODE_ENV: 'development' | 'production' | 'test';

    // Other optional API keys
    // Add your additional environment variables here
  }
}
