'use client';

// 1. React/Next
import React from 'react';

// 3. @/ absolute
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import {
  increment,
  decrement,
  reset,
} from '@/lib/redux/features/counter/actions';
import { login, logout } from '@/lib/redux/features/auth/actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Redux Persist Example Component
 * Demonstrates state persistence with redux-persist
 */
export function ReduxPersistExample() {
  const dispatch = useAppDispatch();
  const counter = useAppSelector((state) => state.counter.count);
  const auth = useAppSelector((state) => state.auth);

  const handleLogin = () => {
    dispatch(
      login({
        id: '123',
        email: 'demo@example.com',
        name: 'Demo User',
      }),
    );
  };

  const handleLogout = () => {
    dispatch(logout());
  };

  return (
    <div className="container mx-auto space-y-8 p-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold">Redux Persist Example</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Demonstration of state persistence with redux-persist. Try changing
          the values below, then refresh the page to see the state persist.
        </p>
      </div>

      {/* Counter Example */}
      <section className="space-y-4">
        <h2 className="text-3xl font-bold">Counter State</h2>
        <Card>
          <CardHeader>
            <CardTitle>Persisted Counter</CardTitle>
            <CardDescription>
              This counter value persists across page refreshes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <Button onClick={() => dispatch(decrement())} variant="outline">
                Decrement
              </Button>
              <div className="min-w-[100px] text-center">
                <p className="text-4xl font-bold">{counter}</p>
              </div>
              <Button onClick={() => dispatch(increment())} variant="outline">
                Increment
              </Button>
            </div>
            <div className="flex justify-center">
              <Button onClick={() => dispatch(reset())} variant="destructive">
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-md bg-slate-100 p-4 dark:bg-slate-800">
          <p className="text-sm font-medium">Try this:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li>Increment the counter several times</li>
            <li>Refresh the page (F5 or Cmd/Ctrl + R)</li>
            <li>Notice the counter value is preserved</li>
            <li>Open DevTools → Application → Local Storage</li>
            <li>See the persisted state under &quot;persist:root&quot;</li>
          </ul>
        </div>
      </section>

      {/* Auth State Example */}
      <section className="space-y-4">
        <h2 className="text-3xl font-bold">Authentication State</h2>
        <Card>
          <CardHeader>
            <CardTitle>Persisted Auth</CardTitle>
            <CardDescription>
              Authentication state persists across sessions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm font-medium">Current State:</p>
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <span className="font-medium">Authenticated:</span>{' '}
                  <span
                    className={
                      auth.isAuthenticated ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    {auth.isAuthenticated ? 'Yes' : 'No'}
                  </span>
                </p>
                {auth.user && (
                  <>
                    <p>
                      <span className="font-medium">User:</span>{' '}
                      {auth.user.name}
                    </p>
                    <p>
                      <span className="font-medium">Email:</span>{' '}
                      {auth.user.email}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {!auth.isAuthenticated ? (
                <Button onClick={handleLogin}>Log In</Button>
              ) : (
                <Button onClick={handleLogout} variant="destructive">
                  Log Out
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="rounded-md bg-slate-100 p-4 dark:bg-slate-800">
          <p className="text-sm font-medium">Try this:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li>Click &quot;Log In&quot; to authenticate</li>
            <li>Refresh the page</li>
            <li>Notice you remain logged in</li>
            <li>Close and reopen the browser tab</li>
            <li>The authenticated state persists</li>
          </ul>
        </div>
      </section>

      {/* How It Works */}
      <section className="space-y-4 rounded-lg border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="text-2xl font-bold">How Redux Persist Works</h2>
        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
          <div>
            <h3 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
              Storage Mechanism
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>localStorage:</strong> Stores Redux state in browser
                local storage
              </li>
              <li>
                <strong>Persistence:</strong> State survives page refreshes and
                browser restarts
              </li>
              <li>
                <strong>Rehydration:</strong> Automatically loads state on app
                startup
              </li>
              <li>
                <strong>Selective:</strong> Choose which reducers to persist via
                whitelist
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
              Configuration
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Key:</strong> &quot;root&quot; - Storage key in
                localStorage
              </li>
              <li>
                <strong>Whitelist:</strong> [&apos;counter&apos;,
                &apos;auth&apos;] - Persisted reducers
              </li>
              <li>
                <strong>Blacklist:</strong> [] - Reducers excluded from
                persistence
              </li>
              <li>
                <strong>Storage:</strong> localStorage (web) or AsyncStorage
                (React Native)
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
              Use Cases
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Authentication:</strong> Keep users logged in across
                sessions
              </li>
              <li>
                <strong>User Preferences:</strong> Theme, language, settings
              </li>
              <li>
                <strong>Shopping Cart:</strong> Preserve cart items
              </li>
              <li>
                <strong>Form Data:</strong> Draft content, partial submissions
              </li>
              <li>
                <strong>UI State:</strong> Sidebar state, filters, pagination
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
              Important Notes
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Security:</strong> Do not persist sensitive data like
                passwords
              </li>
              <li>
                <strong>Size Limit:</strong> localStorage has ~5-10MB limit
              </li>
              <li>
                <strong>Performance:</strong> Large states may slow down
                serialization
              </li>
              <li>
                <strong>Versioning:</strong> Consider migration strategies for
                schema changes
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Developer Tools */}
      <section className="space-y-4 rounded-lg border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="text-2xl font-bold">Debugging</h2>
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            To inspect persisted state:
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open browser DevTools (F12)</li>
            <li>Go to Application tab</li>
            <li>Navigate to Storage → Local Storage</li>
            <li>Find the key &quot;persist:root&quot;</li>
            <li>View the serialized JSON state</li>
          </ol>
          <p className="mt-4 font-semibold text-slate-900 dark:text-slate-100">
            To clear persisted state:
          </p>
          <div className="mt-2">
            <Button
              variant="outline"
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
            >
              Clear All Persisted State
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
