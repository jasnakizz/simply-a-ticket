"use client";

// A segment error boundary: any thrown error inside src/app/events/** (this
// route and everything under it, including /events/[eventId]) renders this
// component instead of an unhandled exception or a blank page. Next.js's App
// Router equivalent of a scoped @ExceptionHandler, wired by the error.tsx
// filename convention rather than an annotation.
import { useEffect } from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";

export default function EventsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next 16.3's stable recovery prop: re-fetches AND re-renders this
  // segment's children. The older re-render-only prop is the wrong fit here
  // because the screen's copy promises a fresh attempt (D-05, plan 09-01).
  retry: () => void;
}) {
  useEffect(() => {
    // The caught object goes to the server log and the browser console only.
    // It is never placed in the DOM: a raw Postgres failure can carry schema
    // and column names that have no business reaching a browser. Only the
    // opaque digest below is ever shown. Running this from an effect (not the
    // render body) keeps it from double-firing under strict / concurrent
    // rendering.
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col flex-1 items-center justify-center">
      <div className="w-full max-w-[560px] px-4 py-6 flex flex-col items-start gap-4 text-left">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          SOMETHING WENT WRONG
        </p>
        <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
          We couldn&apos;t load this page
        </h1>
        <p className="text-[15px] leading-[1.55] text-muted-foreground">
          Check your connection, then try again. If it keeps happening, head back to the events list.
        </p>
        <div className="flex w-full flex-col gap-2 pt-2">
          <Button
            onClick={() => retry()}
            className="min-h-[52px] w-full justify-start text-left"
          >
            Try again
          </Button>
          <Link
            href="/events"
            className={buttonVariants({
              variant: "outline",
              className: "min-h-[52px] justify-start text-left",
            })}
          >
            Back to events
          </Link>
        </div>
        {error.digest && (
          <p className="text-[13px] text-muted-foreground">
            Reference: <span className="break-all">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
