// The App Router picks this file up by its *filename*, not by any
// registration. `not-found.tsx` at the root of the app directory renders for
// any URL that matches no route at all, and for any explicit not-found call
// that has no closer handler — today that is four call sites already in the
// tree (`events/[eventId]`, its order and confirmation routes, and the scan
// route), which until now fell through to the framework's default 404 UI.
//
// This is a UI improvement with identical 404 semantics: same status code,
// same behaviour, restyled screen. Plan 09-05 records exactly that in the
// milestone-diff rationale so it does not read as an unexplained behaviour
// change.
//
// It is a plain Server Component — no interactivity directive, no props, no
// recovery function — so it renders inside the root layout and inherits
// Archivo and the token layer with zero font or stylesheet work.
//
// Security, not style: the copy is fully static. This screen does not read
// the requested URL, request headers, or query parameters, and never
// interpolates a path or a "did you mean" suggestion into the markup. A 404
// that names the path it did not find is a path-enumeration oracle on an app
// whose entire access-control model is an unlisted URL, and it is the classic
// reflected-content vector.
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center">
      <div className="w-full max-w-[560px] px-4 py-6 flex flex-col items-start gap-4 text-left">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          PAGE NOT FOUND
        </p>
        <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
          This page doesn&apos;t exist
        </h1>
        <p className="text-[15px] leading-[1.55] text-muted-foreground">
          The link may be broken, or the page may have moved.
        </p>
        <Link
          href="/events"
          className={buttonVariants({
            variant: "default",
            className: "min-h-[52px] justify-start text-left",
          })}
        >
          Go to events
        </Link>
      </div>
    </div>
  );
}
