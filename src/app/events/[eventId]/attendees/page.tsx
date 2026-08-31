import Link from "next/link";
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import { sumOwedByCurrency, sumCollectedByCurrency } from "@/lib/door-money";
import { formatMoney } from "@/lib/amount";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Same reasoning as the dashboard: staff need the current attendee list on
// every request, not a build-time snapshot frozen when Vercel built the app.
export const dynamic = "force-dynamic";

// Next.js 16 hands `params` as a Promise — typing it as one up front makes the
// compiler catch a missing `await` instead of a runtime error. This plan adds
// no `searchParams` prop on purpose; the filter chips (11-03) introduce it.
export default async function AttendeesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const supabase = createServiceClient();

  // maybeSingle() returns null on no match instead of throwing, so "no such
  // event" and "malformed id" (Postgres rejects a non-uuid with a type error,
  // surfaced here as `error`) collapse to the same honest 404. This is the
  // ONLY thing on the page that 404s — every other bad input degrades.
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    notFound();
  }

  // The chips' data source (11-03 reuses this same read). Same query shape the
  // dashboard runs for its ticket-type list, scoped to this event. A new type
  // row becomes a new badge label with no code change (ATTENDEE-V3-02).
  const { data: ticketTypes, error: ticketTypesError } = await supabase
    .from("ticket_types")
    .select("id, name")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  // Thrown here, caught by src/app/events/error.tsx — a read failure renders
  // the contracted error copy, never an unhandled exception or a blank page.
  if (ticketTypesError) {
    throw ticketTypesError;
  }

  // The attendee list. Column discipline: only the four columns the rows
  // render. attendee_email is fetched here BY DESIGN (ATTENDEE-V3-01 names it a
  // column) — but the QR secret, the pre-paid amount and the issued timestamp
  // are never pulled over the wire. No status filter: a checked-in attendee is
  // still an attendee. Ordering is Postgres's, name A-Z, with an explicit id
  // tiebreak so two identical names keep a reload-stable order (D-09).
  const { data: attendees, error: attendeesError } = await supabase
    .from("tickets")
    .select("id, attendee_name, attendee_email, ticket_type_id")
    .eq("event_id", eventId)
    .order("attendee_name", { ascending: true })
    .order("id", { ascending: true });

  if (attendeesError) {
    throw attendeesError;
  }

  // "Still to collect" — the dashboard's owed chain, verbatim. status =
  // 'issued' is the exact complement of 'checked_in' (closed CHECK set in
  // 0002_tickets.sql). The amount is cast to text inside the select string so a
  // decimal string — never a JS double — crosses the wire.
  const { data: owedTickets, error: owedTicketsError } = await supabase
    .from("tickets")
    .select("pay_at_door_amount::text, currency")
    .eq("event_id", eventId)
    .eq("status", "issued")
    .not("pay_at_door_amount", "is", null);

  if (owedTicketsError) {
    throw owedTicketsError;
  }

  // "Collected at the door" — event-wide, no status filter and no .not(): the
  // shared helper already skips null, zero, malformed and unknown-currency
  // rows. The collected side carries its OWN currency column (0003 made it
  // separate so door staff can take payment in the other currency).
  const { data: collectedTickets, error: collectedTicketsError } = await supabase
    .from("tickets")
    .select("pay_at_door_collected_amount::text, pay_at_door_collected_currency")
    .eq("event_id", eventId);

  if (collectedTicketsError) {
    throw collectedTicketsError;
  }

  // Every money figure comes from the shared helper — this page sums nothing,
  // groups nothing by currency and formats nothing itself. The `?? []` runs
  // only after the throws above, on a successful null.
  const owedSubtotals = sumOwedByCurrency(owedTickets ?? []);
  const collectedSubtotals = sumCollectedByCurrency(collectedTickets ?? []);

  // Real ticket-type name per row (D-05). A row whose type id matches nothing
  // renders no badge rather than a fabricated one.
  const ticketTypeNames = new Map(
    (ticketTypes ?? []).map((type) => [type.id, type.name]),
  );

  const hasAttendees = !!attendees && attendees.length > 0;

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

        <h1 className="text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] break-words">
          Attendees
        </h1>

        <div className="grid grid-cols-2">
          <div className="flex flex-col gap-1 pr-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              COLLECTED AT DOOR
            </p>
            {collectedSubtotals.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                Nothing collected yet.
              </p>
            ) : (
              collectedSubtotals.map((subtotal) => (
                <p
                  key={subtotal.currency}
                  className="text-[13px] font-extrabold leading-[1.3]"
                >
                  {formatMoney(subtotal.amount, subtotal.currency)}
                </p>
              ))
            )}
          </div>
          <div className="flex flex-col gap-1 border-l-2 border-border pl-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-accent-700)]">
              STILL TO COLLECT
            </p>
            {owedSubtotals.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                Nothing owed at the door.
              </p>
            ) : (
              owedSubtotals.map((subtotal) => (
                <p
                  key={subtotal.currency}
                  className="text-[13px] font-extrabold leading-[1.3] text-[var(--color-accent-700)]"
                >
                  {formatMoney(subtotal.amount, subtotal.currency)}
                </p>
              ))
            )}
          </div>
        </div>

        {hasAttendees ? (
          <ul className="flex flex-col">
            {attendees.map((attendee, index) => {
              const typeName = ticketTypeNames.get(attendee.ticket_type_id);
              return (
                <li
                  key={attendee.id}
                  className={
                    index === 0
                      ? "relative flex items-start justify-between gap-3 py-3 pl-3"
                      : "relative flex items-start justify-between gap-3 py-3 pl-3 border-t border-border"
                  }
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[13px] font-extrabold leading-[1.3] break-words">
                      {attendee.attendee_name}
                    </span>
                    <span className="text-[12px] text-muted-foreground break-all">
                      {attendee.attendee_email}
                    </span>
                    {typeName ? (
                      <Badge variant="neutral" className="uppercase">
                        {typeName}
                      </Badge>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col gap-2">
            <h2 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
              No attendees yet
            </h2>
            <p className="text-[15px] leading-[1.55] text-muted-foreground">
              Attendees appear here once an order is placed or a sold ticket is added for this event.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
