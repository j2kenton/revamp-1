# AI Code Generation Rules

## PROJECT OVERVIEW

**Name:** ReVamp - AI-Powered Web Development Framework

**Description:** A production-ready Next.js starter template with built-in AI-assisted development workflows, modern best practices, authentication, state management, and comprehensive testing infrastructure.

**Key Features:**
- Next.js 16 with App Router (React Server Components)
- TypeScript with strict mode
- Authentication with NextAuth.js
- State management with Redux Toolkit and SWR
- UI with Tailwind CSS v4 and shadcn-ui
- Testing with Jest and Playwright
- AI-first development with structured agent workflows

---

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

## FILE ORGANIZATION

**Structure Conventions:**

```plaintext
app/                    # Next.js App Router pages and layouts
├── api/               # API routes (Route Handlers)
├── (main)/            # Main authenticated routes
└── login/             # Public routes

components/            # React components
├── ui/               # shadcn-ui components
└── [feature]/        # Feature-specific components

lib/                   # Shared utilities and configurations
├── auth/             # Authentication logic
├── redux/            # Redux store configuration
└── utils/            # Helper functions

__tests__/            # Unit tests (mirror source structure)
e2e/                  # Playwright E2E tests
types/                # Global TypeScript types
public/               # Static assets
```

**Naming Conventions:**
- Components: `PascalCase.tsx` (e.g., `UserProfile.tsx`)
- Utilities: `camelCase.ts` (e.g., `formatDate.ts`)
- Types: `PascalCase.ts` (e.g., `UserTypes.ts`)
- Tests: `*.test.tsx` or `*.spec.tsx`
- E2E: `*.e2e.ts`

**Import Path Resolution:**
- Use `@/` for absolute imports from project root
- Prefer absolute imports for cross-feature imports
- Use relative imports within same feature directory

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

## BUILD & DEPLOYMENT

**Development Workflow:**

```bash
pnpm install          # Install dependencies
pnpm dev             # Start dev server (localhost:3000)
pnpm type-check      # TypeScript validation
pnpm lint            # ESLint checks
pnpm format          # Prettier formatting
pnpm test:unit       # Run Jest tests
pnpm test:e2e        # Run Playwright tests
pnpm build           # Production build
pnpm start           # Start production server
```

**Environment Variables:**
- Create `.env.local` from `.env.example`
- Never commit `.env.local` or secrets
- Use `process.env.NEXT_PUBLIC_*` for client-side vars only

**Continuous Integration:**
- All PRs must pass: type-check, lint, unit tests
- E2E tests run on main branch merges
- Build verification required before merge

**Deployment:**
- Target platform: Vercel (recommended)
- Auto-deploy from main branch
- Preview deployments for all PRs

---

## SECURITY GATES

```plaintext
☐ Input sanitization (XSS/CSRF prevention)
☐ No hardcoded secrets/API keys
☐ try...catch on unpredictable operations
☐ Edge case handling
```

---

## AI DEVELOPMENT WORKFLOW

**Resources:** See `AI_AGENT_WORKFLOW.md` for full details

**Structured Stages:**

1. **Architecture** (`dev-resources/architecture/`)
   - Generate high-level design from specs
   - Review and validate architecture

2. **Implementation** (`dev-resources/implementation/`)
   - Create detailed implementation plans
   - Review plans before coding

3. **Bug Fixes** (`dev-resources/bugs/`)
   - Analyze bug reports
   - Generate precise fixes

4. **Testing** (`dev-resources/testing/`)
   - Create comprehensive test suites
   - Follow testing philosophy above

**Best Practices:**
- Always start with specs in `dev-resources/specs/doc.pdf`
- Use provided prompts for consistency
- Persist outputs with `pnpm write-output`
- Keep auditable records of AI-generated artifacts

---

## PRE-COMMIT REVIEW

Validate as expert in:
`Security | UX | Architecture | A11y | Privacy | Framework Best Practices`
