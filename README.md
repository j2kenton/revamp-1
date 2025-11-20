# ReVamp - AI-Powered Web Development Framework

> Supercharge your development workflow with AI agents and a production-ready Next.js starter 🚀

ReVamp is a comprehensive web development template that combines modern best practices with AI-assisted development workflows. Build faster, ship better code, and maintain consistency across projects.

## Why ReVamp?

- **🤖 AI-First Development**: Built-in AI coding guidelines and agent workflows
- **⚡ Production-Ready**: Complete setup with authentication, state management, and testing
- **🎨 Beautiful UI**: Pre-configured with Tailwind CSS and shadcn-ui components
- **📚 Rich Examples**: Comprehensive implementation examples for all major features
- **🔒 Secure by Default**: Security best practices baked into every layer
- **♿ Accessible**: WCAG AA compliance from the start

## Quick Start

### Prerequisites

- **Node.js** v20.9.0 or later
- **pnpm** (recommended) or npm
- **Redis** (for local development)

### Installation

```sh
# Clone the repository
git clone <repo-url>
cd <repo-dir>

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) 16.0.1
- **Language**: [TypeScript](https://www.typescriptlang.org/) 5
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) 4
- **UI Components**: [shadcn-ui](https://ui.shadcn.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/) 12.23.24
- **State Management**: [Redux](https://redux.js.org/) 5.0.1 & [React Redux](https://react-redux.js.org/) 9.2.0
- **Data Fetching**: [SWR](https://swr.vercel.app/) 2.3.6
- **Authentication**: [Microsoft Authentication Library (MSAL)](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- **Data Storage**: [Redis](https://redis.io/)
- **AI/LLM**: [Google Gemini](https://ai.google/discover/gemini/)
- **Form Management**: [React Hook Form](https://react-hook-form.com/) 7.66.0
- **Schema Validation**: [Zod](https://zod.dev/) 3.25.76

## Scripts

- `pnpm dev`: Starts the development server.
- `pnpm build`: Builds the application for production.
- `pnpm start`: Starts a production server.
- `pnpm lint`: Lints the codebase using ESLint.
- `pnpm format`: Formats the code using Prettier.
- `pnpm test`: Runs both unit and end-to-end tests.
- `pnpm test:unit`: Runs unit tests using Jest.
- `pnpm test:e2e`: Runs end-to-end tests using Playwright (spins up its own dev server on `PLAYWRIGHT_PORT`, default `3100`, with its own `.next-playwright` build output so you can keep `pnpm dev` running on `3000` simultaneously).
- `pnpm type-check`: Checks for TypeScript errors.

## Git Hooks

- **Automated post-commit tests**: Husky runs `npm run test` (Jest + Playwright) immediately after every commit to surface regressions before pushing.
- **Activation**: `npm install`/`pnpm install` automatically runs the `prepare` script (`husky install`). If hooks ever stop running, execute `npm run prepare`.
- **Skipping in edge cases**: When you intentionally want to bypass the hook (e.g., spike commits), run `SKIP_POST_COMMIT_TESTS=true git commit ...` or set `HUSKY=0`.
- **Troubleshooting**: If the hook fails because dependencies are missing, reinstall with Node 20+ and re-run the commit; the commit already exists, so follow up with `git commit --amend` once tests pass.

## Folder Structure

```plaintext
app/
├── api/
│   ├── chat/
│   │   ├── route.ts
│   │   └── stream/
│   │       └── route.ts
│   └── auth/
│       └── [...nextauth]/
│           └── route.ts
├── chat/
│   ├── page.tsx
│   └── components/
│       ├── ChatHeader.tsx
│       ├── ChatInput.tsx
│       ├── ChatErrorBoundary.tsx
│       ├── ChatSignInPrompt.tsx
│       └── MessageList.tsx
├── login/
│   └── page.tsx
├── layout.tsx
└── page.tsx
components/
├── ui/
│   ├── button.tsx
│   └── input.tsx
└── ThemeToggle.tsx
lib/
├── auth/
│   ├── msalConfig.ts
│   ├── SessionProvider.tsx
│   └── useAuth.ts
├── llm/
│   └── service.ts
├── redis/
│   ├── chat.ts
│   ├── client.ts
│   └── keys.ts
└── constants/
    ├── common.ts
    └── strings.ts
server/
└── middleware/
    ├── csrf.ts
    ├── rate-limit.ts
    └── session.ts
types/
└── models.ts
```

## Architecture

The application is built with a focus on performance, scalability, and user experience. For a more detailed explanation of the architecture, please see the [Architecture documentation](dev-resources/architecture/final.md).

### High-Level Overview

![High-Level Architecture](dev-resources/architecture/review/diagrams/overview/high_level_architecture.md)

### Authentication

Authentication is handled using the Microsoft Authentication Library (MSAL) for React.

![Authentication Flow](dev-resources/architecture/review/diagrams/user/authentication_flow.md)

### Real-time Communication

Real-time communication is achieved using Server-Sent Events (SSE).

![Real-time Chat Flow (SSE)](dev-resources/architecture/review/diagrams/chat/sse_flow.md)

### Data Flow

The application uses Redis as the primary data store.

![Data Flow](dev-resources/architecture/review/diagrams/data/data_flow.md)

### Deployment

The easiest way to deploy your app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

![Deployment Architecture](dev-resources/architecture/review/diagrams/deployment/deployment.md)

Check out the [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## Documentation

- **[Project Walkthrough](WALKTHROUGH.md)**: A detailed explanation of the project's architecture, features, and implementation.
- **[Accessibility Audit](ACCESSIBILITY_AUDIT.md)**: A report on the application's compliance with WCAG 2.1 Level AA.
- **[Architecture Diagrams](dev-resources/architecture/review/diagrams)**: A collection of diagrams illustrating the application's architecture.
