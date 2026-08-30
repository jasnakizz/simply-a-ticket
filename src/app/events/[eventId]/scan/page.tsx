import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createServiceClient } from "@/lib/supabase/server";
import { ScannerClient } from "./scanner-client";

// Same reasoning as every other page reading live Supabase data: staff need
// the current row, not a build-time snapshot. force-dynamic also means the
// wrong-event comparison is always against the real event id.
export const dynamic = "force-dynamic";

// This route lives inside the /events segment (not a top-level
// /scan/[eventId]) specifically so it inherits src/app/events/error.tsx and
// this segment's force-dynamic data pattern for free (D-02). No new error
// boundary.
export default async function ScanPage({
  params,
}: {
  // Next.js 16: params is a Promise — reading it synchronously is a build
  // error. Typing it up front makes the compiler catch a missing await.
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const supabase = createServiceClient();

  // Event NAME only, no date (D-03). maybeSingle so a missing row and a
  // malformed id both land on the same honest 404.
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    notFound();
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-foreground text-background">
      <div className="w-full max-w-[560px] px-4 py-6 flex flex-col gap-4">
        {/* D-03 Modernist header: a Back link to the event dashboard, the event
            name as an uppercase eyebrow, and a 2px 35%-white bottom rule. Back
            navigation is chrome, so it lives here in the Server Component and
            the frozen scanner client is untouched for it. The eyebrow <p> is
            unconditional — an empty event name collapses it to a bare Back row
            rather than removing the header. */}
        <div className="flex items-baseline justify-between gap-4 pb-3 border-b-2 border-background/35">
          <Link
            href={`/events/${event.id}`}
            className="inline-flex items-center gap-1 text-[14px] font-semibold text-background hover:text-[var(--color-accent-400)]"
          >
            <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
            Back
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-background/70 break-words text-right">
            {event.name}
          </p>
        </div>
        <ScannerClient eventId={event.id} />
      </div>
    </div>
  );
}
