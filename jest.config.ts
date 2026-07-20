import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const COVERAGE_THRESHOLD_STATEMENTS = 70;
const COVERAGE_THRESHOLD_BRANCHES = 65;
const COVERAGE_THRESHOLD_FUNCTIONS = 70;
const COVERAGE_THRESHOLD_LINES = 70;

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',

  // Use a project-local cache directory instead of the OS temp dir.
  // On Windows the shared temp haste-map cache can end up locked/owned by
  // another process (AV scanning, a previous interrupted run, OneDrive
  // sync, etc.), which surfaces as an EPERM error when Jest tries to write
  // to it. Keeping the cache inside the repo avoids that shared location.
  // Overridable via JEST_CACHE_DIRECTORY for CI/sandboxed environments where
  // even the repo path isn't writable (e.g. a read-only checkout).
  cacheDirectory: process.env.JEST_CACHE_DIRECTORY || '<rootDir>/.jest-cache',

  // Setup files
  setupFiles: ['<rootDir>/jest.polyfills.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Module paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  // Test patterns
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/__tests__/**/*.spec.[jt]s?(x)',
  ],

  // Coverage configuration
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'server/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    '!**/dist/**',
  ],

  // Coverage thresholds based on roadmap
  coverageThreshold: {
    global: {
      statements: COVERAGE_THRESHOLD_STATEMENTS,
      branches: COVERAGE_THRESHOLD_BRANCHES,
      functions: COVERAGE_THRESHOLD_FUNCTIONS,
      lines: COVERAGE_THRESHOLD_LINES,
    },
  },

  // Transform files
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react',
        },
      },
    ],
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/dist/', '/e2e/'],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
