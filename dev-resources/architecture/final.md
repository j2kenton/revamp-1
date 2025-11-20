# Revamp-1 Architecture

This document outlines the architecture of the Revamp-1 application, a real-time chat application built with Next.js, Redis, and Google Gemini.

## 1. High-Level Overview

The application is a modern, full-stack web application that provides a real-time chat interface for users to interact with an AI assistant. It's built with a focus on performance, scalability, and user experience.

- **Frontend**: Next.js (React) with TypeScript, Tailwind CSS, and Shadcn UI.
- **Backend**: Next.js API Routes (serverless functions) with TypeScript.
- **Real-time Communication**: Server-Sent Events (SSE) for streaming AI responses.
- **Authentication**: Microsoft Authentication Library (MSAL) for secure login.
- **Data Storage**: Redis for caching chat history and user data.
- **AI/LLM**: Google Gemini for generating AI responses.

## 2. File & Folder Structure

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

## 3. Core Component Hierarchy

- `RootLayout` (Server)
  - `ThemeProvider`
  - `MsalProvider`
  - `SessionProvider`
  - `TanStackQueryProvider`
  - `ReduxProvider`
  - `ChatPage` (Client)
    - `ChatHeader`
    - `ChatErrorBoundary`
    - `MessageList`
    - `ChatInput`
    - `ChatSignInPrompt`
  - `LoginPage` (Client)

## 4. TypeScript Data Schemas

```typescript
interface ChatModel {
  id: string;
  userId: string;
  title: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageModel {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'sent' | 'failed' | 'sending';
  parentMessageId: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageDTO {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'sent' | 'failed' | 'sending';
  parentMessageId: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}
```

## 5. API Contracts

- **POST** `/api/chat`
  - **Purpose**: Sends a message and gets an AI response (non-streaming).
  - **Request Body**: `{ content: string, chatId?: string, parentMessageId?: string, idempotencyKey?: string }`
  - **Response**: `{ userMessage: MessageDTO, aiMessage: MessageDTO, chatId: string }`
- **POST** `/api/chat/stream`
  - **Purpose**: Streams an AI response using Server-Sent Events (SSE).
  - **Request Body**: `{ content: string, chatId?: string, parentMessageId?: string }`
  - **Response**: An SSE stream with the following events:
    - `message_created`: Confirms that the user's message has been received and provides the `messageId` and `chatId`.
    - `content_delta`: A chunk of the AI's response.
    - `message_complete`: The full AI response, including metadata.
    - `fallback`: A fallback message if the AI service is unavailable.
    - `error`: An error message if something goes wrong.

## 6. Authentication

Authentication is handled using the Microsoft Authentication Library (MSAL) for React.

- **`lib/auth/msalConfig.ts`**: Contains the configuration for the MSAL client.
- **`lib/auth/SessionProvider.tsx`**: A React context provider that makes the user's session available throughout the application.
- **`lib/auth/useAuth.ts`**: A custom hook that provides a simple interface for logging in, logging out, and acquiring access tokens. It also handles token refresh and a bypass mode for testing.
- **`server/middleware/session.ts`**: A server-side middleware that protects API routes by requiring a valid session.

## 7. Real-time Communication

Real-time communication is achieved using Server-Sent Events (SSE).

- **`app/api/chat/stream/route.ts`**: The backend endpoint that establishes an SSE connection with the client. It handles message creation, calls the LLM streaming service, and sends events to the client.
- **`app/chat/hooks/useStreamingResponse.ts`**: The frontend hook that connects to the SSE endpoint and processes the incoming events. It manages the live message state, handles errors, and provides a simple interface for sending messages.

## 8. Data Storage

Redis is used as the primary data store for the application.

- **`lib/redis/client.ts`**: The Redis client, which is configured to connect to the Redis server.
- **`lib/redis/chat.ts`**: The data access layer for chats and messages. It provides an abstraction over the raw Redis commands for creating, retrieving, updating, and deleting chats and messages.
- **`lib/redis/keys.ts`**: A file that defines the keys used to store data in Redis, preventing key collisions.

## 9. AI/LLM

The application uses Google Gemini as its language model.

- **`lib/llm/service.ts`**: This service encapsulates all the logic for interacting with the Gemini API.
  - **`callLLM` and `callLLMStream`**: Functions for making standard and streaming API calls.
  - **`callLLMWithRetry` and `callLLMStreamWithRetry`**: Wrappers that add retry logic with exponential backoff to handle transient API errors.
  - **`CircuitBreaker`**: A circuit breaker implementation that prevents the application from repeatedly calling a failing service. If the LLM API fails a certain number of times, the circuit breaker will "open" and subsequent calls will fail immediately, returning a fallback message.
  - **`truncateMessagesToFit`**: A function that truncates the chat history to fit within the model's context window, preserving the most recent messages.
  - **Mock LLM**: A mock implementation of the LLM service for development and testing, which can be enabled via environment variables.
- **Constants**: The `lib/llm/service.ts` file now uses named constants for values like temperature, max tokens, and retry delays, making the code more readable and maintainable.

## 10. Error Handling & Monitoring

### Error Boundaries

- **Global Error Boundary**: A global error boundary is not explicitly implemented, but Next.js provides a default error boundary that can be customized by creating an `app/error.tsx` file.
- **Chat Error Boundary**: A specific error boundary for the chat functionality is implemented in `app/chat/components/ChatErrorBoundary.tsx`.
- **API Error Standardization**: The `server/api-response.ts` file provides a set of standardized error responses for the API, such as `badRequest`, `unauthorized`, and `serverError`.

### Monitoring & Observability

- **Logging**: Structured logging is implemented using the `logError`, `logInfo`, and `logWarn` functions in `utils/logger.ts`.
- **Metrics**: The `components/WebVitalsReporter.tsx` component is used to report web vitals metrics.
- **Tracing**: Distributed tracing is not currently implemented.

## 11. Testing Strategy

### Unit Tests

- **Components**: Jest and React Testing Library are used for component testing. Test files are located in the `__tests__` directory.
- **API Routes**: Jest is used for API route testing, with dependencies mocked.
- **Services**: Unit tests for the LLM, Redis, and Auth services are not currently implemented.

### Integration Tests

- **API Integration**: The `__tests__/integration` directory contains integration tests for the chat flow.
- **Redis Integration**: Integration tests for Redis data persistence are not currently implemented.

### E2E Tests

- **Playwright**: Playwright is used for end-to-end testing. The configuration is in `playwright.config.ts`, and the tests are in the `e2e/` directory.
- **Authentication Flows**: The Playwright tests cover login and logout scenarios.
- **Chat Interactions**: The Playwright tests cover message sending and streaming responses.

## 12. Performance Optimizations

### Frontend

- **Code Splitting**: Next.js automatically provides code splitting for each page in the `app` directory.
- **Image Optimization**: The Next.js `Image` component is used for image optimization.
- **Bundle Size**: The application uses modern tools like Webpack and Babel to optimize the bundle size through tree shaking and other techniques.

### Backend

- **Caching Strategy**: Redis is used for caching chat history and session data.
- **Connection Pooling**: The Redis client manages a connection pool to efficiently handle multiple requests.
- **Response Compression**: Vercel, the recommended hosting provider, automatically provides response compression.

## 13. Accessibility (A11y)

- **WCAG AA Compliance**: The application strives to be WCAG AA compliant.
- **Semantic HTML**: The application uses semantic HTML elements to improve accessibility.
- **ARIA labels**: ARIA labels are used to provide additional context for screen readers.
- **Keyboard Navigation**: The application is designed to be fully navigable using a keyboard.
- **Screen Reader Support**: The application is designed to be compatible with screen readers.
- **Focus Management**: Focus management is implemented in the chat interface to ensure a smooth user experience for keyboard users.

## 14. Security Architecture

### Input Validation

- **XSS Prevention**: The `lib/sanitizer.ts` file provides functions for sanitizing user input and preventing Cross-Site Scripting (XSS) attacks.
- **SQL Injection**: The application does not use a SQL database, so SQL injection is not a concern.
- **Command Injection**: The application does not execute shell commands based on user input, so command injection is not a concern.

### Authentication & Authorization

- **Token Management**: The `lib/auth/useAuth.ts` hook handles the acquisition and refresh of access tokens.
- **Role-Based Access**: A role-based access control system is not currently implemented.
- **Session Security**: The `server/middleware/session.ts` middleware uses HttpOnly cookies with the `SameSite=lax` attribute to protect against CSRF attacks.

### Data Protection

- **Encryption at Rest**: Redis data encryption is not currently configured.
- **Encryption in Transit**: The application uses HTTPS to encrypt all data in transit.
- **PII Handling**: The application handles personally identifiable information (PII) such as user names and emails. This data is stored in Redis and is protected by the authentication and authorization mechanisms.

## 15. Deployment Architecture

### Infrastructure

- **Hosting**: Vercel is the recommended hosting provider.
- **CDN**: The Vercel Edge Network is used as a Content Delivery Network (CDN).
- **Redis**: A cloud-based Redis provider such as Redis Cloud or AWS ElastiCache is recommended for production.

### CI/CD Pipeline

- A CI/CD pipeline is not currently configured.

### Environment Configuration

- **Development**: The application can be run locally with a local Redis instance and mock services.
- **Staging**: A staging environment is not currently configured.
- **Production**: A production environment can be set up on Vercel with a cloud-based Redis provider.

## 16. Scalability Strategy

### Horizontal Scaling

- **Serverless Functions**: The Next.js API Routes are serverless functions that can be automatically scaled by the hosting provider.
- **Redis Cluster**: For large datasets, a Redis cluster can be used to shard the data across multiple nodes.
- **Load Balancing**: Vercel automatically provides load balancing for the application.

### Rate Limiting

- **User-based**: The `server/middleware/rate-limit.ts` middleware provides user-based rate limiting for the API.
- **IP-based**: The rate limiting middleware also falls back to IP-based rate limiting if the user is not authenticated.
- **Endpoint-specific**: The rate limiting middleware can be configured with different limits for different endpoints.

### Queue Management

- A message queue for handling bursts of chat requests is not currently implemented.
- Background jobs for asynchronous processing of heavy operations are not currently implemented.

## Recommendations 📋

- **Error Handling & Monitoring**:
  - Implement a global error boundary in `app/error.tsx` to provide a better user experience for unhandled errors.
  - Implement distributed tracing to make it easier to debug issues in a microservices environment.
- **Testing**:
  - Add unit tests for the LLM, Redis, and Auth services.
  - Add integration tests for Redis data persistence.
- **Security**:
  - Implement a role-based access control (RBAC) system to provide more granular control over user permissions.
  - Configure encryption at rest for the Redis database.
- **Deployment**:
  - Set up a CI/CD pipeline to automate the build, test, and deployment process.
  - Set up a staging environment to test changes before deploying to production.
- **Scalability**:
  - Implement a message queue to handle bursts of chat requests and ensure that the system remains responsive under heavy load.
  - Implement background jobs for any long-running or resource-intensive tasks.
- **Other**:
  - Add WebSocket support alongside SSE for bidirectional real-time communication.
  - Add user preferences storage for themes and other settings.
  - Include an API versioning strategy for backward compatibility.
  - Document disaster recovery procedures and backup strategies.
  - Add health check endpoints for monitoring.
  - Consider implementing GraphQL for more flexible data fetching.
  - Add internationalization (i18n) support for multiple languages.
  - Schedule regular dependency updates.
  - Configure security headers such as Content Security Policy (CSP) and HTTP Strict Transport Security (HSTS).
  - Implement audit logging for sensitive operations.
