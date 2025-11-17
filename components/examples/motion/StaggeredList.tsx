/**
 * StaggeredList
 *
 * Demonstrates staggered child animations for a list of items
 * and ensures keyboard/focus accessibility.
 */

'use client';

import { type Key, type ReactNode } from 'react';

import { motion, useReducedMotion, MotionConfig } from 'framer-motion';

import { staggerContainer, fadeInUp } from '@/lib/motion/variants';

export interface StaggeredListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => Key;
  title?: string;
}

export function StaggeredList<T>({
  items,
  renderItem,
  getKey,
  title,
}: StaggeredListProps<T>) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <MotionConfig reducedMotion={prefersReducedMotion ? 'always' : 'never'}>
      <motion.ul
        variants={staggerContainer(0.07, 0.02)}
        initial="hidden"
        animate="show"
        role="list"
        aria-label={title ?? 'Animated list'}
        className="space-y-2"
      >
        {items.map((item, index) => (
          <motion.li
            key={getKey(item, index)}
            variants={fadeInUp}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            tabIndex={0}
          >
            {renderItem(item, index)}
          </motion.li>
        ))}
      </motion.ul>
    </MotionConfig>
  );
}
