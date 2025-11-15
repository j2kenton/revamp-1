/**
 * Type Guards and Assertion Utilities
 * Runtime type checking and validation
 */

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Value must be defined');
  }
}

/**
 * Assert that a value is a string
 */
export function assertString(
  value: unknown,
  message?: string,
): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(message || 'Value must be a string');
  }
}

/**
 * Assert that a value is a number
 */
export function assertNumber(
  value: unknown,
  message?: string,
): asserts value is number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(message || 'Value must be a number');
  }
}

/**
 * Assert that a value is a boolean
 */
export function assertBoolean(
  value: unknown,
  message?: string,
): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(message || 'Value must be a boolean');
  }
}

/**
 * Assert that a value is an array
 */
export function assertArray<T>(
  value: unknown,
  message?: string,
): asserts value is T[] {
  if (!Array.isArray(value)) {
    throw new Error(message || 'Value must be an array');
  }
}

/**
 * Assert that a value is an object
 */
export function assertObject(
  value: unknown,
  message?: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message || 'Value must be an object');
  }
}

/**
 * Type guard: check if value is defined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard: check if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard: check if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard: check if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard: check if value is an array
 */
export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Type guard: check if value is an object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard: check if value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Assert that a condition is true
 */
export function assert(
  condition: boolean,
  message?: string,
): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Exhaustive check for switch/if-else statements
 * Ensures all cases are handled in TypeScript discriminated unions
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message || `Unexpected value: ${JSON.stringify(value)}`);
}
