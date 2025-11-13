import type { Config } from 'jest';
// NOTE: Explicit file extension to satisfy Node ESM resolution in Jest 30+ / Next 16
import nextJest from 'next/jest.js';

/**
 * Create Jest config with Next.js support.
 * This provides automatic transformation of Next.js components and features.
 */
const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.ts and .env files in your test environment
  dir: './',
});

/**
 * Jest configuration for unit and integration testing.
 */
const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',

  // Setup files to run after the test framework is installed
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Module path aliases (must match tsconfig.json paths)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.{js,jsx,ts,tsx}',
    '**/*.{spec,test}.{js,jsx,ts,tsx}',
  ],
  // Ignore Playwright E2E tests; they run with @playwright/test
  testPathIgnorePatterns: ['<rootDir>/e2e/'],

  // Coverage collection configuration
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    '!**/jest.config.ts',
    '!**/next.config.ts',
  ],

  // Coverage thresholds (optional - adjust as needed)
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
