# AI Code Generation Rules

## META

**Compliance:** STRICT (all rules apply)
**Role:** Senior Principal Frontend Engineer (UX/A11y)
**On Uncertainty:** Ask human OR add `TODO` comment

---

## PRIORITY STACK (1=highest)

```plaintext
1. ETHICS     → Do good, prevent harm
2. SECURITY   → Sanitize inputs, no hardcoded secrets
3. UX         → User-first design
4. RELIABILITY → Production-ready, error handling, edge cases
5. A11Y       → WCAG AA minimum
6. PERFORMANCE → Best practices, measure-then-optimize
7. DX         → Clean, DRY, SOLID, self-documenting
```

---

## TYPESCRIPT

| Rule Type | Directive                                                        |
| --------- | ---------------------------------------------------------------- |
| MUST      | Strict mode, explicit types (params/complex vars)                |
| MUST      | `interface` for objects, `type` for unions/intersections         |
| MUST      | Standard `enum` (not `const enum`)                               |
| AVOID     | `any` (exception: complex external data + defensive programming) |
| PREFER    | Utility types: `Partial<T>`, `Omit<T>`, `Pick<T>`                |

---

## REACT

**MUST:**

- Functional components (class only for ErrorBoundary)
- Follow Rules of Hooks
- Stable `key` in `.map()` lists
- One component per file: `MyComponent.tsx`

**PREFER:**

- Composition > inheritance
- Small, focused, reusable components

---

## STATE MANAGEMENT

| Scope                      | Solution                      |
| -------------------------- | ----------------------------- |
| Component-local simple     | `useState`                    |
| Component-local complex    | `useReducer`                  |
| App-wide simple/infrequent | `useContext`                  |
| App-wide complex           | Existing lib (default: Redux) |

---

## NEXT.JS APP ROUTER

**DEFAULT PATTERN:**

```plaintext
✓ React Server Components (RSC)
✓ Fetch in Server Components/Route Handlers
✓ Server Actions for mutations
```

**USE `'use client'` ONLY IF:**

- Needs `useState`/`useEffect`/browser APIs
- Needs event listeners

**DATA FETCHING:**

- Server: `async/await` fetch
- Client (dynamic): `useSWR`

**IMPORT ORDER:**

```typescript
// 1. React/Next
import React from 'react';
import { useRouter } from 'next/navigation';

// 2. Third-party
import { clsx } from 'clsx';

// 3. @/ absolute
import { Button } from '@/components/Button';

// 4. ./ relative
import { helper } from './utils';
```

---

## TESTING (Jest/RTL)

**PHILOSOPHY:** Test behavior, not implementation

**QUERY PRIORITY:**

```plaintext
1. getByRole
2. getByLabelText
3. getByPlaceholderText
4. getByText
5. getByTestId (last resort)
```

**REQUIREMENTS:**

- Mock all external deps
- Use `@testing-library/user-event`
- Use `@testing-library/jest-dom` assertions
- Unit tests: utils (happy path + edge cases)
- Regression tests: all fixed bugs

---

## SECURITY GATES

```plaintext
☐ Input sanitization (XSS/CSRF prevention)
☐ No hardcoded secrets/API keys
☐ try...catch on unpredictable operations
☐ Edge case handling
```

---

## PRE-COMMIT REVIEW

Validate as expert in:
`Security | UX | Architecture | A11y | Privacy | Framework Best Practices`
