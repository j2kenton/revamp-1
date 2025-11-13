/**
 * Framer Motion Variants
 *
 * Common, reusable animation variants with TypeScript types and
 * accessibility-minded defaults (reduced motion friendly when combined
 * with MotionConfig or useReducedMotion in components).
 */

import type { Variants } from 'framer-motion';

/**
 * Fade in with slight upward motion
 */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 250, damping: 24 },
  },
  exit: { opacity: 0, y: 12, transition: { duration: 0.2 } },
};

/**
 * Simple fade in/out
 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/**
 * Scale in with fade
 */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

/**
 * Stagger container: children should define their own `hidden/show` states
 */
export function staggerContainer(stagger = 0.06, delayChildren = 0): Variants {
  return {
    hidden: {},
    show: {
      transition: {
        staggerChildren: Math.max(0, stagger),
        delayChildren: Math.max(0, delayChildren),
      },
    },
  };
}

/**
 * Slide in from a direction with fade
 */
export function slideIn(
  direction: 'up' | 'down' | 'left' | 'right' = 'up',
  distance = 16,
): Variants {
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
  const sign = direction === 'up' || direction === 'left' ? 1 : -1;
  const offset = sign * distance;

  return {
    hidden:
      axis === 'x' ? { opacity: 0, x: offset } : { opacity: 0, y: offset },
    show:
      axis === 'x'
        ? {
            opacity: 1,
            x: 0,
            transition: { type: 'spring', stiffness: 250, damping: 24 },
          }
        : {
            opacity: 1,
            y: 0,
            transition: { type: 'spring', stiffness: 250, damping: 24 },
          },
    exit:
      axis === 'x'
        ? { opacity: 0, x: offset, transition: { duration: 0.15 } }
        : { opacity: 0, y: offset, transition: { duration: 0.15 } },
  };
}
