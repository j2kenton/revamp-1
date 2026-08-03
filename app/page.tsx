import Image from 'next/image';
import Link from 'next/link';

import { LandingSignInButton } from '@/components/landing/LandingSignInButton';
import { SkipLink } from '@/components/SkipLink';
import { STRINGS } from '@/lib/constants/strings';

export default function HomePage() {
  const { landing } = STRINGS;

  return (
    <main className="min-h-screen bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <SkipLink targetId="landing-content">{landing.skipLink}</SkipLink>

      <header className="mx-auto flex w-full max-w-5xl items-center px-6 py-5">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 dark:text-slate-50 dark:focus:ring-blue-400 dark:focus:ring-offset-slate-950"
          aria-label={landing.homeAriaLabel}
        >
          <Image
            src="/gemini-style-logo.png"
            alt=""
            width={36}
            height={36}
            priority
            className="h-9 w-9"
          />
          <span>{landing.productName}</span>
        </Link>
      </header>

      <section
        id="landing-content"
        className="relative isolate overflow-hidden px-6 py-16 sm:py-24"
      >
        <Image
          src="/gemini-style-logo.png"
          alt=""
          width={500}
          height={500}
          priority
          className="pointer-events-none absolute right-[-9rem] top-8 -z-10 h-80 w-80 opacity-10 sm:right-0 sm:h-[28rem] sm:w-[28rem] dark:opacity-20"
        />

        <div className="mx-auto max-w-5xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              {landing.eyebrow}
            </p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight text-slate-950 sm:text-6xl dark:text-white">
              {landing.headline}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-700 dark:text-slate-200">
              {landing.description}
            </p>
            <LandingSignInButton />
          </div>
        </div>
      </section>

      <section
        className="mx-auto grid max-w-5xl gap-6 border-t border-slate-200 px-6 py-10 sm:grid-cols-3 dark:border-slate-800"
        aria-label={landing.featureSectionAriaLabel}
      >
        {landing.features.map((feature) => (
          <article
            key={feature.title}
            className="max-w-sm"
          >
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {feature.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {feature.description}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
