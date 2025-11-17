/**
 * SWR Demo Page
 *
 * Demonstrates all SWR examples in one place.
 * This is a client component showcase page.
 */

'use client';

// 1. React/Next
import { useState } from 'react';

// 3. @/ absolute
import { UserProfile } from '@/components/examples/UserProfile';
import { PostsList } from '@/components/examples/PostsList';
import { TodoList } from '@/components/examples/TodoList';
import { SearchPosts } from '@/components/examples/SearchPosts';

type Tab = 'user' | 'posts' | 'todos' | 'search';

export default function SwrDemoPage() {
  const [activeTab, setActiveTab] = useState<Tab>('user');

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header */}
        <header className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-gray-900">
            SWR Data Fetching Examples
          </h1>
          <p className="text-lg text-gray-600">
            Comprehensive examples of using SWR for data fetching in Next.js
          </p>
        </header>

        {/* Tab Navigation */}
        <nav className="mb-8 border-b border-gray-200">
          <div className="flex gap-4">
            <TabButton
              active={activeTab === 'user'}
              onClick={() => setActiveTab('user')}
              label="User Profile"
            />
            <TabButton
              active={activeTab === 'posts'}
              onClick={() => setActiveTab('posts')}
              label="Posts (Pagination)"
            />
            <TabButton
              active={activeTab === 'todos'}
              onClick={() => setActiveTab('todos')}
              label="Todos (CRUD)"
            />
            <TabButton
              active={activeTab === 'search'}
              onClick={() => setActiveTab('search')}
              label="Search"
            />
          </div>
        </nav>

        {/* Tab Content */}
        <main className="rounded-lg bg-white p-6 shadow-sm">
          {activeTab === 'user' && (
            <section>
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">
                Single Resource Fetching
              </h2>
              <p className="mb-6 text-gray-600">
                Demonstrates basic data fetching with loading, error, and
                success states.
              </p>
              <UserProfile userId="1" />
            </section>
          )}

          {activeTab === 'posts' && (
            <section>
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">
                Paginated Data Fetching
              </h2>
              <p className="mb-6 text-gray-600">
                Shows how to implement pagination with SWR, including page
                navigation.
              </p>
              <PostsList />
            </section>
          )}

          {activeTab === 'todos' && (
            <section>
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">
                CRUD Operations with Mutations
              </h2>
              <p className="mb-6 text-gray-600">
                Demonstrates create, update, and delete operations using SWR
                mutations.
              </p>
              <TodoList userId="1" />
            </section>
          )}

          {activeTab === 'search' && (
            <section>
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">
                Real-time Search
              </h2>
              <p className="mb-6 text-gray-600">
                Shows debounced search with dynamic query parameters.
              </p>
              <SearchPosts />
            </section>
          )}
        </main>

        {/* Info Section */}
        <aside className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h3 className="mb-2 text-lg font-semibold text-blue-900">
            📚 Learn More
          </h3>
          <p className="mb-4 text-sm text-blue-700">
            These examples demonstrate common SWR patterns. Check the
            implementation files for detailed code and comments.
          </p>
          <ul className="space-y-2 text-sm text-blue-700">
            <li>
              <code className="rounded bg-blue-100 px-2 py-1">
                lib/swr/hooks.ts
              </code>{' '}
              - Custom SWR hooks
            </li>
            <li>
              <code className="rounded bg-blue-100 px-2 py-1">
                lib/swr/fetcher.ts
              </code>{' '}
              - Fetcher functions
            </li>
            <li>
              <code className="rounded bg-blue-100 px-2 py-1">
                components/examples/
              </code>{' '}
              - Example components
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

/**
 * Tab Button Component
 */
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function TabButton({ active, onClick, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </button>
  );
}
