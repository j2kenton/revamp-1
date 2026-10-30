import Image from 'next/image';
import Link from 'next/link';

import { LandingSignInButton } from '@/components/landing/LandingSignInButton';
import { STRINGS } from '@/lib/constants/strings';

// Crayon accent per feature card, in display order (toy-block squares)
const FEATURE_ACCENTS = [
  'bg-rose-400 dark:bg-rose-500',
  'bg-amber-400 dark:bg-amber-500',
  'bg-emerald-400 dark:bg-emerald-500',
];

export default function HomePage() {
  const { landing } = STRINGS;

  return (
    <main className="min-h-screen bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <a href="#landing-content" className="skip-link">
        {landing.skipLink}
      </a>

      <header className="mx-auto flex w-full max-w-5xl items-center px-6 py-5">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 dark:text-slate-50 dark:focus:ring-blue-400 dark:focus:ring-offset-slate-950"
          aria-label={landing.homeAriaLabel}
        >
          <Image
            src="/ai-playroom-logo.svg"
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
        {/* Crayon color blobs */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute right-[-6rem] top-[-4rem] h-72 w-72 rounded-full bg-amber-300/40 blur-3xl dark:bg-amber-500/20" />
          <div className="absolute right-24 top-36 h-56 w-56 rounded-full bg-rose-300/40 blur-3xl dark:bg-rose-500/20" />
          <div className="absolute bottom-[-4rem] right-[-2rem] h-64 w-64 rounded-full bg-sky-300/40 blur-3xl dark:bg-sky-500/20" />
          <div className="absolute bottom-[-5rem] left-1/3 h-48 w-48 rounded-full bg-emerald-300/30 blur-3xl dark:bg-emerald-500/15" />
        </div>

        <Image
          src="/ai-playroom-logo.svg"
          alt=""
          width={320}
          height={320}
          priority
          className="pointer-events-none absolute right-6 top-20 -z-10 hidden h-64 w-64 rotate-6 opacity-80 sm:block lg:right-16 lg:h-80 lg:w-80"
        />

        <div className="mx-auto max-w-5xl">
          <div className="max-w-2xl">
            <p className="inline-flex items-center rounded-full bg-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
              {landing.eyebrow}
            </p>
            <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-tight text-slate-950 sm:text-6xl dark:text-white">
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
        {landing.features.map((feature, index) => (
          <article
            key={feature.title}
            className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-10 rounded-full ${FEATURE_ACCENTS[index % FEATURE_ACCENTS.length]}`}
            />
            <h2 className="mt-4 text-base font-semibold text-slate-950 dark:text-white">
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
