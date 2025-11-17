/**
 * Search Component
 *
 * Example component demonstrating real-time search with SWR
 * Shows debouncing and dynamic data fetching based on user input.
 */

'use client';

import { useState } from 'react';
import { useSearch } from '@/lib/swr/hooks';
import type { Post } from '@/lib/swr/types';

export function SearchPosts() {
  const [searchTerm, setSearchTerm] = useState('');

  const {
    data: results,
    error,
    isLoading,
  } = useSearch<Post>(
    '/api/posts/search',
    searchTerm,
    500, // 500ms debounce
  );

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search posts..."
          className="w-full rounded-lg border border-gray-300 px-4 py-3 pl-10 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Search posts"
        />
        <svg
          className="absolute left-3 top-3.5 h-5 w-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {isLoading && (
          <div
            className="absolute right-3 top-3.5"
            role="status"
            aria-label="Searching"
          >
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          </div>
        )}
      </div>

      {/* Results */}
      {searchTerm.trim().length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {error && (
            <div className="p-4 text-sm text-red-600" role="alert">
              Error: {error.message}
            </div>
          )}

          {!isLoading && !error && (!results || results.length === 0) && (
            <div className="p-8 text-center text-gray-500">
              No results found for &ldquo;{searchTerm}&rdquo;
            </div>
          )}

          {results && results.length > 0 && (
            <ul className="divide-y divide-gray-200" role="list">
              {results.map((post) => (
                <li
                  key={post.id}
                  className="p-4 transition-colors hover:bg-gray-50"
                >
                  <h3 className="font-semibold text-gray-900">{post.title}</h3>
                  <p className="mt-1 text-sm text-gray-700 line-clamp-2">
                    {post.content}
                  </p>
                  {post.author && (
                    <p className="mt-2 text-xs text-gray-500">
                      By {post.author.name}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {searchTerm.trim().length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-gray-500">Start typing to search posts...</p>
        </div>
      )}
    </div>
  );
}
