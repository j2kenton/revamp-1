/**
 * Empty State Component
 * Reusable empty state display following shadcn/ui patterns
 */

import type { ReactNode } from 'react';
import clsx from 'clsx';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  variant?: 'info' | 'error' | 'warning';
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  variant = 'info',
  className,
}: EmptyStateProps) {
  const bgColorClass = {
    info: 'bg-blue-100',
    error: 'bg-red-100',
    warning: 'bg-amber-100',
  }[variant];

  const iconColorClass = {
    info: 'text-blue-600',
    error: 'text-red-600',
    warning: 'text-amber-600',
  }[variant];

  const titleColorClass = 'text-gray-900';
  const descriptionColorClass = 'text-gray-500';

  return (
    <div className={clsx('flex h-full items-center justify-center', className)}>
      <div className="text-center">
        <div
          className={clsx(
            'mb-4 mx-auto flex h-16 w-16 items-center justify-center rounded-full',
            bgColorClass
          )}
        >
          <div className={clsx('h-8 w-8', iconColorClass)}>{icon}</div>
        </div>
        <h3 className={clsx('mb-2 text-lg font-semibold', titleColorClass)}>
          {title}
        </h3>
        {description && (
          <p className={clsx('text-sm', descriptionColorClass)}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
