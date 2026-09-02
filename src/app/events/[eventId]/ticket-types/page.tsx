import Link from "next/link";
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
// The add-type panel component is imported from its ORIGINAL path, not moved
// into this route folder. Three test files pin that exact path by string —
// test/app/pages/create-event.source.test.ts (the D-23 sibling-parity gate),
// test/app/pages/issued-and-ticket-type.source.test.ts, and
// test/app/pages/phase7-contract.test.ts (the frozen v2 nine-file list) — so a
// `git mv` here would churn a shipped v2 milestone artifact for no benefit.
// Do not "tidy" this into a local import.
import { AddTicketTypeForm } from "../add-ticket-type-form";

// Same reasoning as every other event screen: staff need the current ticket-type
// list on every request, not a build-time snapshot frozen when Vercel built the
// app. `export const dynamic = "force-dynamic"` is what makes the reads below run
// at request time.
export const dynamic = "force-dynamic";

// In Next.js 16, `params` is a Promise, not a plain object — reading it
// synchronously (the shape every older Next.js tutorial shows) is a build error.
// Typing it as a Promise up front makes the compiler catch a missing `await`.
export default async function TicketTypesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const supabase = createServiceClient();

  // maybeSingle() returns null on no match instead of throwing, so "no such
  // event" and "malformed id" (Postgres rejects a non-uuid with a type error,
  // surfaced here as `error`) collapse to the same honest 404 rather than a
  // stack trace. This is the ONLY thing on the page that 404s.
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    notFound();
  }

  // The list read. `.eq("event_id", eventId)` is the load-bearing tenant-scoping
  // control that keeps another event's ticket types off this page — the Phase
  // 10/11 contract, identical in shape to every sibling event screen. Ordered by
  // creation time so a newly added type lands last, never left to Postgres row
  // order.
  //
  // The error is thrown, never coalesced to an empty array: an empty array means
  // "this event has no ticket types", and a failed read must never be able to
  // say that. The throw is caught by src/app/events/error.tsx because this route
  // lives under src/app/events/.
  const { data: ticketTypes, error: ticketTypesError } = await supabase
    .from("ticket_types")
    .select("id, name, description")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (ticketTypesError) {
    throw ticketTypesError;
  }

  // No read of the tickets table anywhere on this screen — the per-type sold
  // count was descoped from milestone v4 (decision D-01). If it returns in a
  // later milestone, the intended grouped-read shape is recorded in
  // .planning/ROADMAP.md Planning Notes.

  return (
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-[560px] px-4 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link
            href={`/events/${eventId}`}
            className={buttonVariants({
              variant: "ghost",
              className: "px-0 justify-start",
            })}
          >
            ← Event
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground text-right break-words">
            {event.name}
          </p>
        </div>

        <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
          Ticket types
        </h1>

        {ticketTypes && ticketTypes.length > 0 ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              EXISTING TYPES
            </p>
            <ul className="flex flex-col">
              {ticketTypes.map((ticketType, index) => (
                <li
                  key={ticketType.id}
                  className={
                    index === 0
                      ? "flex flex-col gap-1 py-3"
                      : "flex flex-col gap-1 border-t border-border py-3"
                  }
                >
                  <p className="text-[12px] font-extrabold break-words">
                    {ticketType.name}
                  </p>
                  <p className="text-[12px] text-muted-foreground break-words">
                    {ticketType.description}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          // Testing the populated side FIRST (length > 0) rather than the
          // dashboard block's inverted `length === 0` means a null rows value
          // renders this empty state instead of an empty <ul>.
          <div className="flex flex-col gap-2">
            <h2 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
              No ticket types yet
            </h2>
            <p className="text-[15px] leading-[1.55] text-muted-foreground">
              Add a ticket type below to start selling this event.
            </p>
          </div>
        )}

        {/* Rendered AFTER the list-or-empty ternary and OUTSIDE it, so the
            always-open add panel is present in both states (TYPES-V4-06). */}
        <div className="flex flex-col gap-4">
          <h2 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
            Add ticket type
          </h2>
          <AddTicketTypeForm eventId={eventId} />
        </div>
      </div>
    </div>
  );
}
