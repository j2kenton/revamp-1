/**
 * FadeInCard
 *
 * Simple card that fades and slides into view on mount.
 * Honors reduced motion preferences for accessibility.
 */

'use client';

import { type ReactNode } from 'react';
import { motion, useReducedMotion, MotionConfig } from 'framer-motion';
import { fadeInUp } from '@/lib/motion/variants';

export interface FadeInCardProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function FadeInCard({ title, subtitle, children }: FadeInCardProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <MotionConfig reducedMotion={prefersReducedMotion ? 'always' : 'never'}>
      <motion.section
        variants={fadeInUp}
        initial="hidden"
        animate="show"
        exit="exit"
        aria-label={title}
        className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <header className="mb-3">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
        </header>
        <div className="text-gray-800">{children}</div>
      </motion.section>
    </MotionConfig>
  );
}
