/**
 * Theme Toggle Component
 * UI control for switching between light/dark themes
 */

'use client';

import clsx from 'clsx';
import { useTheme } from '@/lib/theme/ThemeProvider';

export function ThemeToggle() {
  const { theme, actualTheme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="theme-select" className="sr-only">
        Select theme
      </label>
      <select
        id="theme-select"
        value={theme}
        onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
        className={clsx(
          'rounded-md border px-3 py-1.5 text-sm font-medium',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          'dark:border-gray-600 dark:bg-gray-700 dark:text-white'
        )}
        aria-label="Theme selector"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>

      {/* Visual indicator */}
      <div
        className={clsx(
          'flex h-8 w-8 items-center justify-center rounded-full',
          'bg-gray-200 dark:bg-gray-700'
        )}
        aria-hidden="true"
      >
        {actualTheme === 'dark' ? (
          <svg
            className="h-5 w-5 text-yellow-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 text-yellow-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
