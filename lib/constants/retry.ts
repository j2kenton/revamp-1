/**
 * Retry and Backoff Constants
 * Constants related to retry logic and exponential backoff
 */

export const MAX_RETRY_COUNT = 3;
export const RETRY_DELAY_BASE_MS = 1000;
export const BACKOFF_EXPONENT = 2;
export const MAX_RETRY_DELAY_MS = 4000;
export const MIN_RETRY_AFTER_SECONDS = 60;
