import Link from "next/link";
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import { sumOwedByCurrency, sumCollectedByCurrency } from "@/lib/door-money";
import { formatMoney } from "@/lib/amount";
import { formatCheckInClock } from "@/lib/date";
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

  // The attendee list. Column discipline: only the columns the rows render.
  // attendee_email is fetched here BY DESIGN (ATTENDEE-V3-01 names it a column);
  // 11-02 adds the five the per-row states need — status, checked_in_at, the
  // pay-at-door amount + its currency, and the collected amount — each amount
  // cast to text so a decimal STRING crosses the wire (src/lib/amount.ts is the
  // whole reason). The collected CURRENCY column is deliberately NOT fetched
  // here: no per-row collected figure ships this phase, so only the
  // collected-total chain needs it. The QR secret, the pre-paid amount and the
  // issued timestamp are still never pulled over the wire. No status filter: a
  // checked-in attendee is still an attendee. Ordering is Postgres's, name A-Z,
  // with an explicit id tiebreak so two identical names keep a reload-stable
  // order (D-09).
  const { data: attendees, error: attendeesError } = await supabase
    .from("tickets")
    .select(
      "id, attendee_name, attendee_email, ticket_type_id, status, checked_in_at, pay_at_door_amount::text, currency, pay_at_door_collected_amount::text",
    )
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

              // D-12 check-in guard — the same shape the dashboard uses before
              // formatting checked_in_at: only a non-empty string that parses
              // to a real instant reaches the formatter. Anything else (null,
              // empty, unparseable) is "not arrived" — never an epoch date.
              // The green left bar is driven off THIS same fact, so a row can
              // never show a bar without a time or a time without a bar.
              const checkedInAt = attendee.checked_in_at;
              const checkInClock =
                typeof checkedInAt === "string" &&
                checkedInAt !== "" &&
                !Number.isNaN(new Date(checkedInAt).getTime())
                  ? formatCheckInClock(checkedInAt)
                  : null;
              const isCheckedIn = checkInClock !== null;

              // D-13 right side — three mutually exclusive states, decided by
              // ONE if/else-if/else chain (see the JSX below) so exactly one
              // renders. The collected branch is tested FIRST: a checked-in
              // pay-at-door attendee carries BOTH pay_at_door_amount (the
              // balance owed, never cleared — migration 0003) and a collected
              // amount, and such a row must read "Paid at door", never as owing.
              const collectedAmount = attendee.pay_at_door_collected_amount;
              const isCollected =
                typeof collectedAmount === "string" &&
                /^\d+(?:\.\d{1,2})?$/.test(collectedAmount);

              // Strictly positive, tested on the STRING with the same anchored
              // shape src/lib/door-money.ts uses (whole part, optional 1-2
              // decimals, anchored) — then any non-zero digit means > 0. Never
              // a numeric coercion. null / "" / "0" / "0.00" / malformed all
              // fall through to "render nothing".
              const doorAmount = attendee.pay_at_door_amount;
              const doorCurrency = attendee.currency;
              const owedLabel =
                typeof doorAmount === "string" &&
                /^\d+(?:\.\d{1,2})?$/.test(doorAmount) &&
                /[1-9]/.test(doorAmount) &&
                typeof doorCurrency === "string"
                  ? formatMoney(doorAmount, doorCurrency)
                  : null;

              return (
                <li
                  key={attendee.id}
                  className={[
                    "relative flex items-start justify-between gap-3 py-3 pl-3 border-l-4",
                    isCheckedIn
                      ? "border-l-[var(--color-checked-in)]"
                      : "border-l-transparent",
                    index === 0 ? "" : "border-t border-border",
                  ].join(" ")}
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
                    {isCheckedIn ? (
                      <span className="text-[12px] font-semibold text-[var(--color-checked-in)]">
                        Checked in {checkInClock}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">
                        Not arrived
                      </span>
                    )}
                  </div>
                  {isCollected ? (
                    <span className="shrink-0 text-right text-[12px] text-muted-foreground">
                      Paid at door
                    </span>
                  ) : owedLabel !== null ? (
                    <span className="shrink-0 text-right text-[13px] font-extrabold text-[var(--color-accent-700)]">
                      {owedLabel}
                    </span>
                  ) : null}
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
