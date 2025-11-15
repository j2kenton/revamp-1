# UI Feedback Implementation Guide

This guide outlines how to implement richer UI feedback for the chat application as specified in Task B of the architecture roadmap.

## Overview

Rich UI feedback improves user experience by providing clear visual and accessible indicators for message status, input validation, and system state.

## Message Status Indicators

### Implementation

Use the message `status` field from `MessageDTO`:

```typescript
type MessageStatus = 'sending' | 'sent' | 'failed' | 'read';
```

### Visual Indicators

**Sending State:**

- Icon: Spinning loader or clock icon
- Color: Neutral/gray
- Text: "Sending..."

**Sent State:**

- Icon: Single checkmark
- Color: Success/green
- Text: "Sent"

**Failed State:**

- Icon: Error/exclamation icon
- Color: Error/red
- Text: "Failed to send"
- Action: Retry button

**Read State:**

- Icon: Double checkmark
- Color: Primary/blue
- Text: "Read"

### Example Component

```typescript
'use client';

import { CheckIcon, ClockIcon, XCircleIcon } from '@heroicons/react/24/outline';
import type { MessageDTO } from '@/types/models';

interface MessageStatusProps {
  status: MessageDTO['status'];
  onRetry?: () => void;
}

export function MessageStatus({ status, onRetry }: MessageStatusProps) {
  switch (status) {
    case 'sending':
      return (
        <div className="flex items-center gap-1 text-gray-500">
          <ClockIcon className="h-4 w-4 animate-spin" />
          <span className="sr-only">Sending</span>
        </div>
      );
    
    case 'sent':
      return (
        <div className="flex items-center gap-1 text-green-600">
          <CheckIcon className="h-4 w-4" />
          <span className="sr-only">Sent</span>
        </div>
      );
    
    case 'failed':
      return (
        <div className="flex items-center gap-1 text-red-600">
          <XCircleIcon className="h-4 w-4" />
          <span className="sr-only">Failed</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-sm underline hover:no-underline"
              aria-label="Retry sending message"
            >
              Retry
            </button>
          )}
        </div>
      );
    
    case 'read':
      return (
        <div className="flex items-center gap-1 text-blue-600">
          <CheckIcon className="h-4 w-4" />
          <CheckIcon className="h-4 w-4 -ml-2" />
          <span className="sr-only">Read</span>
        </div>
      );
    
    default:
      return null;
  }
}
```

## Character Counter

### Character Counter Implementation

```typescript
'use client';

import { useState, useEffect } from 'react';

interface CharacterCounterProps {
  value: string;
  maxLength: number;
  softLimit?: number; // Warning threshold (e.g., 80% of max)
}

export function CharacterCounter({
  value,
  maxLength,
  softLimit = Math.floor(maxLength * 0.8),
}: CharacterCounterProps) {
  const [count, setCount] = useState(value.length);
  
  useEffect(() => {
    setCount(value.length);
  }, [value]);
  
  const remaining = maxLength - count;
  const isNearLimit = count >= softLimit;
  const isAtLimit = count >= maxLength;
  
  return (
    <div
      className={`text-sm ${
        isAtLimit
          ? 'text-red-600 font-semibold'
          : isNearLimit
            ? 'text-yellow-600'
            : 'text-gray-500'
      }`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {count} / {maxLength}
      {isAtLimit && (
        <span className="ml-2" role="alert">
          Character limit reached
        </span>
      )}
    </div>
  );
}
```

### Usage

```typescript
<CharacterCounter
  value={messageContent}
  maxLength={2000}
  softLimit={1800}
/>
```

## Toast Notifications

### Toast Implementation

Create a toast notification system for transient feedback:

```typescript
'use client';

import { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { Toast } from '@/types/state';

interface ToastProps extends Toast {
  onClose: (id: string) => void;
}

export function ToastNotification({
  id,
  type,
  message,
  duration = 5000,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => onClose(id), duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);
  
  const colors = {
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  };
  
  return (
    <div
      className={`flex items-center gap-3 p-4 rounded-lg border ${colors[type]} shadow-lg`}
      role="alert"
      aria-live="polite"
    >
      <p className="flex-1">{message}</p>
      <button
        onClick={() => onClose(id)}
        className="text-current hover:opacity-75"
        aria-label="Close notification"
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
```

## Inline Error Messages

For blocking validation errors, use inline messages:

```typescript
interface InlineErrorProps {
  error: string | null;
  id?: string;
}

export function InlineError({ error, id }: InlineErrorProps) {
  if (!error) return null;
  
  return (
    <div
      id={id}
      className="flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-md border border-red-200"
      role="alert"
    >
      <XCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <p className="text-sm">{error}</p>
    </div>
  );
}
```

## Accessible Live Regions

For dynamic status updates that should be announced to screen readers:

```typescript
'use client';

import { useEffect, useRef } from 'react';

interface LiveRegionProps {
  message: string;
  politeness?: 'polite' | 'assertive';
}

export function LiveRegion({
  message,
  politeness = 'polite',
}: LiveRegionProps) {
  const regionRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (regionRef.current && message) {
      // Clear and re-add to ensure announcement
      regionRef.current.textContent = '';
      setTimeout(() => {
        if (regionRef.current) {
          regionRef.current.textContent = message;
        }
      }, 100);
    }
  }, [message]);
  
  return (
    <div
      ref={regionRef}
      className="sr-only"
      role="status"
      aria-live={politeness}
      aria-atomic="true"
    />
  );
}
```

## Loading States

```typescript
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function LoadingSpinner({ size = 'md', label = 'Loading...' }: LoadingSpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };
  
  return (
    <div className="flex items-center justify-center gap-2">
      <div
        className={`${sizes[size]} animate-spin rounded-full border-4 border-gray-200 border-t-blue-600`}
        role="status"
        aria-label={label}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
```

## Integration with TanStack Query

Use the hooks from `lib/tanstack-query/hooks.ts`:

```typescript
'use client';

import { useSendMessage } from '@/lib/tanstack-query/hooks';
import { MessageStatus } from '@/components/MessageStatus';
import { CharacterCounter } from '@/components/CharacterCounter';
import { ToastNotification } from '@/components/ToastNotification';

export function ChatInput({ chatId }: { chatId: string }) {
  const [content, setContent] = useState('');
  const sendMessage = useSendMessage(chatId);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await sendMessage.mutateAsync(content);
      setContent('');
    } catch (error) {
      // Error is handled by mutation
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={2000}
        disabled={sendMessage.isPending}
      />
      
      <CharacterCounter
        value={content}
        maxLength={2000}
      />
      
      <button
        type="submit"
        disabled={sendMessage.isPending || content.trim().length === 0}
      >
        {sendMessage.isPending ? 'Sending...' : 'Send'}
      </button>
      
      {sendMessage.isError && (
        <InlineError error={sendMessage.error?.message} />
      )}
    </form>
  );
}
```

## Best Practices

1. **Always provide screen reader text** for visual-only indicators
2. **Use appropriate ARIA live regions** for dynamic updates
3. **Debounce rapid status changes** to avoid announcement spam
4. **Color is not the only indicator** - use icons and text
5. **Ensure color contrast** meets WCAG AA standards (4.5:1 for text)
6. **Test with keyboard navigation** and screen readers
7. **Provide actionable feedback** (e.g., retry buttons on errors)
8. **Use animations sparingly** and respect `prefers-reduced-motion`

## Color Contrast Requirements

- Normal text: 4.5:1 minimum
- Large text (18pt+ or 14pt+ bold): 3:1 minimum
- UI components: 3:1 minimum

Test colors using tools like:

- Chrome DevTools Accessibility panel
- WebAIM Contrast Checker
- axe DevTools browser extension
