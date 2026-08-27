import { notFound } from "next/navigation";

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
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-md px-6 py-6 flex flex-col gap-4">
        <h1 className="text-2xl font-semibold leading-[1.2] break-words">
          {event.name}
        </h1>
        <ScannerClient eventId={event.id} />
      </div>
    </div>
  );
}
