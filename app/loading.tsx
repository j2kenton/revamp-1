export default function Loading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      role="status"
    >
      <div className="text-center">
        <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
