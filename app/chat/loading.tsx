/**
 * Chat Page Loading State
 */

export default function ChatLoading() {
  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="h-8 w-32 animate-pulse rounded bg-gray-200"></div>
        <div className="h-10 w-24 animate-pulse rounded bg-gray-200"></div>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 p-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200"></div>
                <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200"></div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 bg-white p-4">
          <div className="h-20 w-full animate-pulse rounded bg-gray-200"></div>
        </div>
      </main>
    </div>
  );
}
