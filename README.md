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
- **Authentication**: [NextAuth.js](https://next-auth.js.org/) 4.24.13
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

## Folder Structure

```plaintext
├── app
│   ├── api
│   │   ├── auth
│   │   └── ...
│   ├── (main)
│   │   ├── dashboard
│   │   └── ...
│   └── login
├── components
│   ├── ui
│   └── ...
├── lib
│   ├── auth
│   ├── redux
│   └── ...
├── public
└── ...
```

- **app**: Contains all the routes, such as `/` (app/page.tsx) and `/login` (app/login/page.tsx).
- **app/api**: Contains all the API routes for the application.
- **components**: Contains all the reusable components.
- **lib**: Contains all the utility functions and libraries.
- **public**: Contains all the static assets.

## Deploy on Vercel

The easiest way to deploy your app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
