/**
 * Jest setup file.
 * This file runs once before all tests and is used to configure
 * the testing environment and add custom matchers.
 */
import '@testing-library/jest-dom';
import { Blob, File } from 'node:buffer';
import { FormData, Headers, Request, Response, fetch } from 'undici';

// Provide browser-like primitives for server-focused tests
if (!globalThis.fetch) {
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
}
if (!globalThis.Headers) {
  globalThis.Headers = Headers as unknown as typeof globalThis.Headers;
}
if (!globalThis.Request) {
  globalThis.Request = Request as unknown as typeof globalThis.Request;
}
if (!globalThis.Response) {
  globalThis.Response = Response as unknown as typeof globalThis.Response;
}
if (!globalThis.FormData) {
  globalThis.FormData = FormData as unknown as typeof globalThis.FormData;
}
if (!globalThis.Blob) {
  globalThis.Blob = Blob as unknown as typeof globalThis.Blob;
}
if (!globalThis.File) {
  globalThis.File = File as unknown as typeof globalThis.File;
}

if (!process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID) {
  process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID = 'test-client-id';
}
if (!process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID) {
  process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID = 'test-tenant';
}
if (!process.env.MOCK_REDIS) {
  process.env.MOCK_REDIS = 'true';
}

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// IntersectionObserver
class MockIntersectionObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}
Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Global timeout
jest.setTimeout(60000);

// Suppress console errors during tests (optional)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
