/**
 * Theme Toggle Component
 * UI control for switching between light/dark themes
 */

'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { useTheme } from '@/lib/theme/ThemeProvider';
import { STRINGS } from '@/lib/constants/strings';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const themeOptions = [
  {
    value: 'light' as const,
    icon: '🌞',
    label: STRINGS.theme.light,
    tooltip: 'Use light theme for bright environments',
  },
  {
    value: 'dark' as const,
    icon: '🌜',
    label: STRINGS.theme.dark,
    tooltip: 'Use dark theme for low-light environments',
  },
  {
    value: 'system' as const,
    icon: '⚙️',
    label: STRINGS.theme.system,
    tooltip: 'Automatically match your system preferences',
  },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const currentOption =
    themeOptions.find((opt) => opt.value === theme) || themeOptions[0];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={clsx(
            'cursor-pointer rounded-md border px-2 py-1 text-sm font-medium',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
            'dark:border-gray-600 dark:bg-gray-700 dark:text-white',
          )}
          aria-label={STRINGS.theme.ariaLabel}
          title="Switch between light, dark, or system theme"
        >
          {currentOption.icon} {currentOption.label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="flex flex-col gap-1">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setTheme(option.value);
                setIsOpen(false);
              }}
              className={clsx(
                'flex flex-col items-start rounded-md px-3 py-2 text-left text-sm transition-colors',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                theme === option.value && 'bg-gray-100 dark:bg-gray-700',
              )}
            >
              <span className="font-medium">
                {option.icon} {option.label}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {option.tooltip}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
