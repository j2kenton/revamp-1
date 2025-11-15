# WCAG A Accessibility Compliance Guide

This guide ensures the application meets WCAG 2.1 Level A compliance standards as specified in Task K of the architecture roadmap.

## Overview

WCAG (Web Content Accessibility Guidelines) Level A represents the minimum level of accessibility compliance. This guide covers keyboard navigation, semantic HTML, ARIA attributes, color contrast, and assistive technology support.

## Keyboard Navigation

### Requirements

All interactive elements must be:

- **Reachable** via keyboard (Tab, Shift+Tab)
- **Activatable** via keyboard (Enter, Space)
- **Visible** when focused (focus indicators)
- **Logical** in tab order

### Implementation

#### Focus Indicators

```css
/* globals.css - Ensure visible focus indicators */
*:focus-visible {
  outline: 2px solid #0066CC;
  outline-offset: 2px;
}

/* For dark backgrounds */
.dark *:focus-visible {
  outline-color: #66B3FF;
}

/* Remove default outline only when using custom */
*:focus {
  outline: none;
}

*:focus-visible {
  outline: 2px solid currentColor;
}
```

#### Skip Links

Add skip navigation for keyboard users:

```typescript
// components/SkipLink.tsx
'use client';

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-md"
    >
      Skip to main content
    </a>
  );
}
```

Add to layout:

```typescript
// app/layout.tsx
import { SkipLink } from '@/components/SkipLink';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        {/* ... rest of layout */}
        <main id="main-content">
          {children}
        </main>
      </body>
    </html>
  );
}
```

#### Focus Traps

For modals and dialogs:

```typescript
'use client';

import { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

export function Modal({ isOpen, onClose, children, title }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store currently focused element
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      // Focus first focusable element in modal
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements && focusableElements.length > 0) {
        (focusableElements[0] as HTMLElement).focus();
      }
    } else {
      // Restore focus when modal closes
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" className="text-xl font-bold mb-4">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
```

## Semantic HTML

### Use Correct Elements

```typescript
// ❌ Bad - Non-semantic
<div onClick={handleClick}>Click me</div>

// ✅ Good - Semantic button
<button onClick={handleClick}>Click me</button>

// ❌ Bad - Div as link
<div onClick={navigate}>Go to page</div>

// ✅ Good - Proper link
<a href="/page">Go to page</a>
```

### Heading Hierarchy

```typescript
// ✅ Correct heading structure
<main>
  <h1>Page Title</h1>
  <section>
    <h2>Section Title</h2>
    <h3>Subsection</h3>
  </section>
  <section>
    <h2>Another Section</h2>
  </section>
</main>

// ❌ Wrong - Skipping levels
<h1>Title</h1>
<h3>Skipped H2</h3>
```

### Landmarks

```typescript
<body>
  <header>
    <nav aria-label="Main navigation">
      {/* Navigation links */}
    </nav>
  </header>
  
  <main id="main-content">
    <article>
      {/* Main content */}
    </article>
    
    <aside aria-label="Related content">
      {/* Sidebar */}
    </aside>
  </main>
  
  <footer>
    {/* Footer content */}
  </footer>
</body>
```

## ARIA Attributes

### Labels and Descriptions

```typescript
// Form inputs
<label htmlFor="email">Email Address</label>
<input
  id="email"
  type="email"
  aria-required="true"
  aria-describedby="email-help"
/>
<span id="email-help">We'll never share your email</span>

// Buttons without visible text
<button aria-label="Close dialog">
  <XIcon className="h-5 w-5" />
</button>

// Icon-only links
<a href="/settings" aria-label="Settings">
  <SettingsIcon />
</a>
```

### States and Properties

```typescript
// Toggle button
<button
  aria-pressed={isActive}
  onClick={() => setIsActive(!isActive)}
>
  {isActive ? 'Active' : 'Inactive'}
</button>

// Expandable section
<button
  aria-expanded={isExpanded}
  aria-controls="section-content"
  onClick={() => setIsExpanded(!isExpanded)}
>
  Toggle Section
</button>
<div id="section-content" hidden={!isExpanded}>
  {/* Content */}
</div>

// Loading state
<button aria-busy={isLoading} disabled={isLoading}>
  {isLoading ? 'Loading...' : 'Submit'}
</button>
```

### Live Regions

```typescript
// Polite announcements (non-urgent)
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

// Assertive announcements (urgent)
<div aria-live="assertive" aria-atomic="true">
  {errorMessage}
</div>

// Status updates
<div role="status" aria-live="polite">
  {`${items.length} items in cart`}
</div>
```

## Forms

### Labels and Associations

```typescript
'use client';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  helpText?: string;
}

export function FormField({
  id,
  label,
  error,
  required = false,
  helpText,
  ...inputProps
}: FormFieldProps) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block font-medium mb-1">
        {label}
        {required && <span aria-label="required"> *</span>}
      </label>
      
      {helpText && (
        <p id={helpId} className="text-sm text-gray-600 mb-2">
          {helpText}
        </p>
      )}
      
      <input
        id={id}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={`${helpText ? helpId : ''} ${error ? errorId : ''}`.trim()}
        {...inputProps}
      />
      
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
```

### Error Handling

```typescript
'use client';

import { useState } from 'react';

export function AccessibleForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const newErrors = validateForm();
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      // Focus first error
      const firstErrorField = Object.keys(newErrors)[0];
      document.getElementById(firstErrorField)?.focus();
    } else {
      setSubmitted(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {submitted && (
        <div role="status" className="bg-green-50 p-4 rounded mb-4">
          Form submitted successfully
        </div>
      )}
      
      {Object.keys(errors).length > 0 && (
        <div role="alert" className="bg-red-50 p-4 rounded mb-4">
          <h3 className="font-bold">Please fix the following errors:</h3>
          <ul className="list-disc pl-5 mt-2">
            {Object.entries(errors).map(([field, error]) => (
              <li key={field}>
                <a href={`#${field}`}>{error}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Form fields */}
    </form>
  );
}
```

## Color and Contrast

### Contrast Requirements

- **Normal text**: 4.5:1 contrast ratio (WCAG AA, recommended)
- **Large text** (18pt+ or 14pt+ bold): 3:1 contrast ratio (WCAG AA)
- **UI components**: 3:1 contrast ratio
- **Color not sole indicator**: Use icons, patterns, or text

### Color Implementation Examples

```typescript
// Use color + icon
<div className="flex items-center gap-2">
  <CheckCircleIcon className="h-5 w-5 text-green-600" />
  <span className="text-green-700">Success</span>
</div>

// Error with icon and text
<div className="flex items-center gap-2">
  <XCircleIcon className="h-5 w-5 text-red-600" />
  <span className="text-red-700">Error occurred</span>
</div>

// Status with multiple indicators
<span
  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
  role="status"
>
  <span className="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden="true" />
  Active
</span>
```

## Images and Media

### Alternative Text

```typescript
// Informative images
<img
  src="/chart.png"
  alt="Sales increased by 25% in Q4"
/>

// Decorative images
<img
  src="/decoration.png"
  alt=""
  role="presentation"
/>

// Complex images
<figure>
  <img
    src="/complex-chart.png"
    alt="Organization chart"
    aria-describedby="chart-description"
  />
  <figcaption id="chart-description">
    The organization has 5 departments: Engineering, Sales, Marketing, HR, and Finance.
    Each department reports to the CEO.
  </figcaption>
</figure>

// Icon buttons
<button aria-label="Delete message">
  <TrashIcon aria-hidden="true" />
</button>
```

## Motion and Animation

### Respect User Preferences

```css
/* globals.css */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

```typescript
'use client';

import { useEffect, useState } from 'react';

export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

// Usage
export function AnimatedComponent() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={prefersReducedMotion ? '' : 'animate-fade-in'}
    >
      Content
    </div>
  );
}
```

## Testing Checklist

### Automated Testing

```bash
# Install axe-core
pnpm add -D @axe-core/react jest-axe

# Run accessibility tests
pnpm test:unit
```

```typescript
// __tests__/a11y/accessibility.test.tsx
import { axe, toHaveNoViolations } from 'jest-axe';
import { render } from '@testing-library/react';
import { ChatInput } from '@/components/ChatInput';

expect.extend(toHaveNoViolations);

describe('Accessibility', () => {
  it('should not have accessibility violations', async () => {
    const { container } = render(<ChatInput chatId="test" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

### Manual Testing

#### Keyboard Navigation Test

- [ ] Tab through all interactive elements
- [ ] Ensure logical tab order
- [ ] Activate buttons with Enter/Space
- [ ] Navigate forms with Tab/Shift+Tab
- [ ] Close modals with Escape
- [ ] Test focus traps in dialogs

#### Screen Reader Testing

- [ ] Test with NVDA (Windows)
- [ ] Test with JAWS (Windows)
- [ ] Test with VoiceOver (Mac/iOS)
- [ ] Test with TalkBack (Android)
- [ ] Verify all content is announced
- [ ] Check form labels and errors
- [ ] Verify live region announcements

#### Visual Testing

- [ ] Zoom to 200% - content reflows
- [ ] Check focus indicators visible
- [ ] Test with high contrast mode
- [ ] Verify color contrast ratios
- [ ] Test with color blindness simulators

#### Tools

- **Browser DevTools**: Lighthouse accessibility audit
- **axe DevTools**: Browser extension for automated testing
- **WAVE**: Web accessibility evaluation tool
- **Color Contrast Analyzer**: Desktop app for contrast checking
- **Screen Reader**: NVDA, JAWS, VoiceOver, TalkBack

## Common Patterns

### Chat Message List

```typescript
'use client';

import type { MessageDTO } from '@/types/models';

interface ChatMessagesProps {
  messages: MessageDTO[];
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions"
      className="flex flex-col gap-4"
    >
      {messages.map((message) => (
        <article
          key={message.id}
          className="flex gap-3"
          aria-label={`Message from ${message.role}`}
        >
          <div className="flex-1">
            <div className="font-medium mb-1">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div>{message.content}</div>
            <div className="text-sm text-gray-500 mt-1">
              <time dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleTimeString()}
              </time>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
```

### Accessible Tabs

```typescript
'use client';

import { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
}

export function Tabs({ tabs }: TabsProps) {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  return (
    <div>
      <div role="tablist" aria-label="Chat sections">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                const nextTab = tabs[(index + 1) % tabs.length];
                setActiveTab(nextTab.id);
              } else if (e.key === 'ArrowLeft') {
                const prevTab = tabs[(index - 1 + tabs.length) % tabs.length];
                setActiveTab(prevTab.id);
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
```

## Documentation

Create accessibility statement:

```markdown
# Accessibility Statement

We are committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone and apply relevant accessibility standards.

## Conformance Status

This application is partially conformant with WCAG 2.1 Level A.

## Feedback

We welcome your feedback on the accessibility of this application. Please contact us if you encounter accessibility barriers.

## Known Issues

- [List any known accessibility issues]

## Compatibility

This application is designed to be compatible with:
- Screen readers (NVDA, JAWS, VoiceOver)
- Keyboard navigation
- Browser zoom up to 200%
- High contrast mode
```

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [axe Accessibility Testing](https://www.deque.com/axe/)
- [WebAIM Resources](https://webaim.org/)
- [A11y Project Checklist](https://www.a11yproject.com/checklist/)
