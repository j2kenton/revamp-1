/**
 * Theme Toggle Component
 * UI control for switching between light/dark themes
 */

'use client';

import clsx from 'clsx';
import { useTheme } from '@/lib/theme/ThemeProvider';
import { STRINGS } from '@/lib/constants/strings';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center">
      <label htmlFor="theme-select" className="sr-only">
        {STRINGS.theme.selectLabel}
      </label>
      <select
        id="theme-select"
        value={theme}
        onChange={(e) =>
          setTheme(e.target.value as 'light' | 'dark' | 'system')
        }
        className={clsx(
          'rounded-md border pr-1 py-1 text-sm font-medium',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          'dark:border-gray-600 dark:bg-gray-700 dark:text-white',
        )}
        aria-label={STRINGS.theme.ariaLabel}
      >
        <option value="light">🌞 {STRINGS.theme.light}</option>
        <option value="dark">🌜 {STRINGS.theme.dark}</option>
        <option value="system">⚙️ {STRINGS.theme.system}</option>
      </select>
    </div>
  );
}
