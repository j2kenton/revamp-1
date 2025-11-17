/**
 * Posts List Component
 *
 * Example component demonstrating pagination with SWR
 * Shows loading states, error handling, and pagination controls.
 */

'use client';

import { useState } from 'react';
import { usePosts } from '@/lib/swr/hooks';

export function PostsList() {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, error, isLoading } = usePosts(page, pageSize);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading posts">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-gray-200 p-4"
          >
            <div className="mb-2 h-6 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-200" />
            <div className="mt-2 h-4 w-5/6 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-4"
        role="alert"
      >
        <h3 className="font-semibold text-red-900">Error loading posts</h3>
        <p className="text-sm text-red-700">{error.message}</p>
      </div>
    );
  }

  // No data state
  if (!data || data.data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-700">No posts found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Posts list */}
      <div className="space-y-4">
        {data.data.map((post) => (
          <article
            key={post.id}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-bold text-gray-900">
              {post.title}
            </h2>
            <p className="mb-4 text-gray-700 line-clamp-3">{post.content}</p>
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                {post.author && `By ${post.author.name}`}
                {!post.author && 'Unknown author'}
              </span>
              <time dateTime={post.createdAt}>
                {new Date(post.createdAt).toLocaleDateString()}
              </time>
            </div>
            {post.tags && post.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        <p className="text-sm text-gray-700">
          Showing{' '}
          <span className="font-medium">{(page - 1) * pageSize + 1}</span> to{' '}
          <span className="font-medium">
            {Math.min(page * pageSize, data.total)}
          </span>{' '}
          of <span className="font-medium">{data.total}</span> posts
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Previous page"
          >
            Previous
          </button>
          <span className="flex items-center px-4 text-sm text-gray-700">
            Page {page} of {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            className="rounded bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
