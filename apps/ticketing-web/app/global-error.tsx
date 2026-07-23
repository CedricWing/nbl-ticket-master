'use client';

// Only catches errors thrown by the root layout itself (e.g. a font/provider failure) —
// app/error.tsx handles everything below it. Next requires this to render its own
// <html>/<body> since it replaces the root layout when it triggers.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-neutral-500">{error.message || 'An unexpected error occurred.'}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
