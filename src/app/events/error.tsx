"use client";

// A segment error boundary: any thrown error inside src/app/events/** (this
// route and everything under it, including /events/[eventId] once plan
// 01-04 adds it) renders this component instead of an unhandled exception
// or a blank page. Next.js's App Router equivalent of a global
// @ExceptionHandler, scoped to one route segment via the error.tsx
// filename convention rather than an annotation.
import { Button } from "@/components/ui/button";

export default function EventsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Visible in server logs only — the caught error's own message is never
  // rendered to the browser, since a raw Postgres error can carry schema
  // detail that has no business reaching a browser.
  console.error(error);

  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-4 p-6 text-center">
      <p className="text-base leading-[1.5]">
        Something went wrong loading events. Check your connection and try again.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
