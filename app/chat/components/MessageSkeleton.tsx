/**
 * Message Skeleton Loader
 * Loading state for messages
 */

export function MessageSkeleton() {
  return (
    <div className="flex gap-3 animate-pulse">
      <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200"></div>
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-200"></div>
        <div className="h-4 w-1/2 rounded bg-gray-200"></div>
        <div className="h-3 w-24 rounded bg-gray-200"></div>
      </div>
    </div>
  );
}
