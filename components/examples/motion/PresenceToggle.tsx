/**
 * PresenceToggle
 *
 * Demonstrates mount/unmount animations using AnimatePresence.
 */

'use client';

import { useState } from 'react';
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from 'framer-motion';
import { scaleIn } from '@/lib/motion/variants';

export function PresenceToggle() {
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Presence Toggle</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          aria-expanded={open}
          aria-controls="presence-panel"
        >
          {open ? 'Hide' : 'Show'} Panel
        </button>
      </div>

      <MotionConfig reducedMotion={prefersReducedMotion ? 'always' : 'never'}>
        <AnimatePresence initial={false} mode="popLayout">
          {open && (
            <motion.div
              id="presence-panel"
              role="region"
              aria-label="Animated panel"
              variants={scaleIn}
              initial="hidden"
              animate="show"
              exit="exit"
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
            >
              <p className="text-gray-700">
                This panel mounts and unmounts with animation using
                AnimatePresence.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </section>
  );
}
