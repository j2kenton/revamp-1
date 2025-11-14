# AI-Powered Chat Application - Technical Plan

**Note:** The examples provided in this document (file structures, component hierarchies, data schemas, and API contracts) are illustrative. They serve as a starting point and should be adapted to meet the specific requirements of the project.

## 1. File & Folder Structure

```plaintext
app/
├── api/
│   ├── auth/
│   │   └── [...nextauth]/
│   │       └── route.ts
│   └── chat/
│       └── route.ts
├── chat/
│   └── page.tsx
├── layout.tsx
└── page.tsx
components/
├── chat/
│   ├── chat-input.tsx
│   ├── chat-messages.tsx
│   └── chat-sidebar.tsx
├── layout/
│   ├── navbar.tsx
│   └── theme-toggle.tsx
└── ui/
    ├── button.tsx
    ├── input.tsx
    └── card.tsx
lib/
├── auth.ts
├── chat.ts
├── redux/
│   ├── features/
│   │   ├── auth/
│   │   ├── counter/
│   │   └── chat/         // New Chat Feature
│   │       ├── actions.ts
│   │       ├── reducer.ts
│   │       └── types.ts
│   ├── hooks.ts
│   ├── ReduxProvider.tsx
│   ├── rootReducer.ts
│   └── store.ts
├── schemas.ts        // Zod validation schemas
types/
└── index.ts
```

## 2. Core Component Hierarchy

<!-- Note: This plan uses the standard Next.js App Router for navigation. This deviates from the spec's recommendation of TanStack Router to follow framework best practices and ensure deeper integration with Next.js features. -->
* `RootLayout` (Server)
  * `Navbar` (Client)
    * `ThemeToggle` (Client)
    * `UserAvatar` (Client)
  * `HomePage` (Server Component at `app/page.tsx`)
  * `ChatPage` (Client Component at `app/chat/page.tsx`)
    * `ChatSidebar` (Client)
    * `ChatMessages` (Client)
    * `ChatInput` (Client)

## 3. TypeScript Data Schemas

```typescript
// types/index.ts

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

interface Chat {
  id:string;
  messages: Message[];
}
```

```typescript
// lib/redux/features/chat/types.ts
export interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
}

// Action types
export const ADD_MESSAGE = 'chat/addMessage';
export const SET_ACTIVE_CHAT = 'chat/setActiveChat';

interface AddMessageAction {
  type: typeof ADD_MESSAGE;
  payload: { chatId: string; message: Message };
}

interface SetActiveChatAction {
  type: typeof SET_ACTIVE_CHAT;
  payload: { chatId: string };
}

export type ChatActionTypes = AddMessageAction | SetActiveChatAction;
```

```typescript
// lib/schemas.ts
import { z } from 'zod';

export const msalSigninSchema = z.object({
  token: z.string(),
});

export const chatMessageSchema = z.object({
  chatId: z.string(),
  message: z.string().min(1).max(2000),
});
```

## 4. API Contracts

* **POST** `/api/auth/signin/msal`
  * **Purpose**: Authenticates a user with MSAL.
  * **Request Body**: `msalSigninSchema`
  * **Response**: `{ session: Session }`
* **POST** `/api/auth/signout`
  * **Purpose**: Signs out the currently authenticated user.
  * **Response**: `200 OK`
* **GET** `/api/auth/session`
  * **Purpose**: Retrieves the current user session.
  * **Response**: `{ session: Session }`
* **POST** `/api/chat`
  * **Purpose**: Sends a message to the AI LLM and gets a response.
  * **Request Body**: `chatMessageSchema`
  * **Response**: `{ message: Message }`

## 5. Validation Strategy

* **Client-Side**: `zod` will be used with a form library (like `react-hook-form`) to provide real-time validation on user inputs, such as the chat input field.
* **Server-Side**: All API route handlers will use `zod` schemas (from `lib/schemas.ts`) to parse and validate incoming request bodies. This ensures that the data is in the correct format before any processing occurs, preventing invalid data from entering the system.

## 6. State Management Strategy

<!-- Note: This plan deviates from the spec doc in two areas to align with the existing codebase and framework best practices.
1. State Management: Uses Redux (existing in codebase) instead of Zustand.
2. The choice of TanStack Query deviates from the existing codebase convention (SWR) to strictly adhere to the project requirements outlined in the specification document. -->
* **Global State (Complex):** For managing complex, app-wide state like chat history, the existing plain Redux setup will be used.
  * A new `chat` feature will be added following the established pattern in `lib/redux/features/`.
  * This involves creating a `chat` directory with `actions.ts`, `reducer.ts`, and `types.ts`.
  * The new `chatReducer` will be added to the `combineReducers` call in `lib/redux/rootReducer.ts`.
  * Components will interact with the chat state using the existing typed hooks from `lib/redux/hooks.ts` (`useAppSelector` and `useAppDispatch`).
* **Component State:** For simple UI state like input fields or loading states, use React's built-in `useState` hook.
* **Server Cache State:** For managing the cache of server-side data, use `TanStack Query`.
  * Custom hooks will be created to wrap `useQuery` and `useMutation` for specific data types (e.g., `useChatHistory`, `useSendMessage`).

## 7. Testing Strategy

* **Unit Tests**:
  * **Target**: Individual functions, Redux actions and reducers, components (`ChatInput`), and validation schemas (`chatMessageSchema`).
  * **Framework**: Jest, React Testing Library.
  * **Location**: `__tests__` directory alongside the file being tested.
  * **Goal**: Verify that the unit of code works as expected, covering edge cases.
* **Integration Tests**:
  * **Target**: Multiple components working together to simulate user interactions.
  * **Framework**: Jest, React Testing Library.
  * **Location**: `__tests__` directory.
  * **Goal**: Verify that a user can navigate to the chat page, send a message, and see the state update in the Redux store.
* **End-to-End (E2E) Tests**:
  * **Target**: Full application flows, from UI interactions to backend API calls.
  * **Framework**: Playwright.
  * **Location**: `e2e/` directory.
  * **Goal**: Verify that critical user paths work in a production-like environment.
