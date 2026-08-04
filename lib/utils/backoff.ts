/**
 * Backoff jitter.
 *
 * Plain exponential backoff synchronizes clients: everyone who failed at the
 * same moment retries at the same moment, so the recovering service gets hit
 * by the same spike that knocked it over (a "thundering herd"). Jitter spreads
 * those retries out.
 *
 * This uses *equal jitter* (see AWS's "Exponential Backoff and Jitter"):
 * keep half the computed delay, randomize the other half. Compared to full
 * jitter (`random() * delay`) it never collapses to a near-zero wait, which
 * matters for a user-facing reconnect where an instant retry is wasted work.
 */

const JITTER_RATIO = 0.5;

/**
 * Spread a computed backoff delay across `[delay/2, delay]`.
 */
export function withJitter(delayMs: number): number {
  const fixed = delayMs * JITTER_RATIO;
  const random = Math.random() * (delayMs - fixed);
  return Math.round(fixed + random);
}
