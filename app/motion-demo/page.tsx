/**
 * Framer Motion Demo Page
 *
 * Showcases simple entry animation, staggered list, and AnimatePresence.
 */

'use client';

// 1. React/Next
import React from 'react';

// 3. @/ absolute
import { FadeInCard } from '@/components/examples/motion/FadeInCard';
import { StaggeredList } from '@/components/examples/motion/StaggeredList';
import { PresenceToggle } from '@/components/examples/motion/PresenceToggle';

export default function MotionDemoPage() {
  const items = Array.from({ length: 5 }, (_, i) => `Item ${i + 1}`);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-5xl px-4">
        <header className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-gray-900">
            Framer Motion Examples
          </h1>
          <p className="text-lg text-gray-600">
            A few common patterns: entry, list stagger, and presence.
          </p>
        </header>

        <main className="space-y-8">
          <FadeInCard
            title="Entry Animation"
            subtitle="Fades and slides into view on mount"
          >
            <p>
              This card uses a simple fade + upward motion on initial render. It
              respects reduced-motion preferences via MotionConfig and
              useReducedMotion.
            </p>
          </FadeInCard>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-gray-900">
              Staggered List
            </h2>
            <StaggeredList
              items={items}
              getKey={(item) => item}
              renderItem={(item) => (
                <span className="text-gray-800">{item}</span>
              )}
              title="Staggered example list"
            />
          </section>

          <PresenceToggle />
        </main>
      </div>
    </div>
  );
}
