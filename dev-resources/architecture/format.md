# [Project Name] - Technical Plan

**Deviation Note:** If the generated plan deviates from the structure defined in this document, an HTML-style comment (`<!-- ... -->`) must be added to explain the reason for the deviation.

**Specification Note:** If the generated plan must deviate from the recommendations in the spec doc, a comment (`<!-- ... -->`) must be added to note and explain why.

**Note:** The examples provided in this document (file structures, component hierarchies, data schemas, and API contracts) are illustrative. They serve as a starting point and should be adapted to meet the specific requirements of the project.

## 1. File & Folder Structure

(An example tree view of the root project directory. This should be adapted for the actual project.)

```plaintext
app/
├── api/
│   └── auth/
│       └── [...nextauth]/
│           └── route.ts
├── dashboard/
│   └── page.tsx
├── login/
│   └── page.tsx
├── layout.tsx
└── page.tsx
components/
├── auth/
│   └── login-form.tsx
├── layout/
│   └── navbar.tsx
└── ui/
    ├── button.tsx
    └── input.tsx
lib/
└── auth.ts
types/
└── index.ts
```

## 2. Core Component Hierarchy

(An example list of components and their relationships. This should be adapted for the actual project.)

* `RootLayout` (Server)
  * `Navbar` (Client)
  * `HomePage` (Server)
  * `LoginPage` (Client)
    * `LoginForm` (Client)
  * `DashboardPage` (Server)

## 3. TypeScript Data Schemas

(All `interface` and `type` definitions for the core data models. The following are examples.)

```typescript
interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface Session {
  user?: User;
  expires: ISODateString;
}
```

## 4. API Contracts

(A list of all API endpoints, including HTTP method, URL, purpose, and request/response schemas. The following are examples.)

* **POST** `/api/auth/signin`
  * **Purpose**: Authenticates a user with credentials.
  * **Request Body**: `{ email: string, password: string }`
  * **Response**: `{ session: Session }`
* **POST** `/api/auth/signout`
  * **Purpose**: Signs out the currently authenticated user.
  * **Response**: `200 OK`
* **GET** `/api/auth/session`
  * **Purpose**: Retrieves the current user session.
  * **Response**: `{ session: Session }`

## 5. Validation Strategy

(A description of the validation approach for both client-side and server-side.)

* **Client-Side**: Describe the strategy for validating user input in the browser.
* **Server-Side**: Describe the strategy for validating data received at API endpoints.

## 6. State Management Strategy

(A description of the state management approach. This should be adapted for the actual project, considering the existing use of Redux.)

* **Global State**: For state that is accessed by many components across the app, use Redux.

  * Define new state features in `lib/redux/features/`. Each feature should have its own directory containing separate files for actions, reducers, and types.

  * Create actions, reducers, and types as needed.
* Use `useAppSelector` to access state and `useAppDispatch` to dispatch actions.
* **Component State**: For state that is local to a single component or a small group of related components, use React's built-in `useState` or `useReducer` hooks.
* **Server Cache State**: For managing the cache of server-side data, `useSWR` or React Query should be considered.

## 7. Testing Strategy

(A description of the testing approach for different levels of testing. This should be adapted for the actual project.)

* **Unit Tests**:
  * **Target**: Individual functions, hooks, and components in isolation.
  * **Framework**: Jest, React Testing Library.
  * **Location**: `__tests__` directory alongside the file being tested.
  * **Goal**: Verify that the unit of code works as expected, covering edge cases.
* **Integration Tests**:
  * **Target**: Multiple components working together, simulating user interactions.
  * **Framework**: Jest, React Testing Library.
  * **Location**: `__tests__` directory.
  * **Goal**: Verify that features work from the user's perspective within a portion of the app.
* **End-to-End (E2E) Tests**:
  * **Target**: Full application flows, from UI interactions to backend API calls.
  * **Framework**: Playwright.
  * **Location**: `e2e/` directory.
  * **Goal**: Verify that critical user paths work in a production-like environment.
