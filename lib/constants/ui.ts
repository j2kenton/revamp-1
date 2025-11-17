/**
 * UI Constants
 * Constants for timing, dimensions, and UI behavior
 */

// Message/Input limits
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_CHAT_MESSAGE_LENGTH = 10000;

// Debounce and timing
export const CHAR_COUNT_DEBOUNCE_MS = 300;
export const SEND_DEBOUNCE_MS = 600;
export const FOCUS_DELAY_MS = 0;
export const CHAR_COUNT_IMMEDIATE_THRESHOLD = 200;

// UI thresholds
export const MESSAGE_LENGTH_WARNING_THRESHOLD = 0.9; // 90% of max length

// Virtual scrolling
export const ESTIMATED_MESSAGE_HEIGHT_PX = 120;
export const VIRTUAL_SCROLL_OVERSCAN_COUNT = 5;

// Loading skeleton counts
export const LOADING_SKELETON_COUNT = 3;

// Random string generation
export const RANDOM_STRING_RADIX = 36;
export const RANDOM_STRING_SLICE_START = 2;
export const RANDOM_STRING_SLICE_END = 8;
