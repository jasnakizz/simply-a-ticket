import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { createServiceClient } from "@/lib/supabase/server";
import { formatEventDateRange, formatRelativeTime } from "@/lib/date";
import { eventStatus } from "@/lib/event-status";
import { sumResidualOwedByCurrency } from "@/lib/door-money";
import { formatMoney } from "@/lib/amount";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScanBar } from "@/components/ui/scan-bar";
import { CountsStrip } from "@/components/ui/counts-strip";

// Same reasoning as /events: staff need the current data, not a build-time
// snapshot frozen at whatever existed when Vercel built the app.
export const dynamic = "force-dynamic";

// In Next.js 16, `params` is a Promise, not a plain object — reading it
// synchronously (the shape every older Next.js tutorial shows) is a build
// error here. Typing it as a Promise up front makes the compiler catch a
// missing `await` for us instead of finding out at runtime.
export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const supabase = createServiceClient();

  // maybeSingle() returns null on no match instead of throwing, which lets
  // us treat "no such row" and "malformed id" (Postgres rejects a non-uuid
  // string with a type error, surfaced here as `error`) the same way: both
  // are an honest 404, not a stack trace.
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, starts_at, ends_at, location")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    notFound();
  }

  // The time-aware door-open status (DOORS-V4-01..05). `eventStatus` reads
  // today's Europe/Belgrade civil date from its default `new Date()` — the
  // server's clock at the moment this Server Component renders. `export const
  // dynamic = "force-dynamic"` above is what makes that render happen on every
  // page load rather than once at build time, so the badge is always "as of now"
  // and no polling or realtime subscription is needed to keep it fresh.
  const status = eventStatus(event.starts_at, event.ends_at);

  // Count-only read for the "Ticket types · N" dashboard row (D-05). The page
  // no longer renders the rows — the dedicated /ticket-types screen does — so
  // this is an exact-count head read: Postgres returns a real COUNT(*) in a
  // response header and zero rows cross the wire, the same idiom as the two
  // tickets figures below. The `.eq("event_id", eventId)` filter is still the
  // one thing keeping another event's ticket types off this page.
  const { count: ticketTypeCountRaw, error: ticketTypesError } = await supabase
    .from("ticket_types")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  // Thrown here, caught by src/app/events/error.tsx — a failed read must never
  // be coalesced into a plausible-looking zero.
  if (ticketTypesError) {
    throw ticketTypesError;
  }

  // The zero coalesce is what makes an event with no ticket types render a
  // "Ticket types · 0" row that STILL links, rather than hiding the row —
  // TYPES-V4-06's dashboard half.
  const ticketTypeCount = ticketTypeCountRaw ?? 0;

  // Sold figure — every ticket for this event, with no status filter. The
  // exact-count head read asks Postgres for a real COUNT(*) returned in a
  // response header, with zero rows over the wire — we never fetch the rows
  // and measure `.length`. The event_id filter is the only thing standing
  // between a guessed event id in the URL and another event's numbers.
  const { count: ticketsSoldCountRaw, error: ticketsSoldError } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  // Same failure idiom as ticket_types above: a read failure must reach
  // src/app/events/error.tsx, never be coalesced into a plausible-looking zero.
  if (ticketsSoldError) {
    throw ticketsSoldError;
  }

  const ticketsSoldCount = ticketsSoldCountRaw ?? 0;

  // Checked-in figure — the same read narrowed to status = 'checked_in'. A
  // checked-in ticket is a SUBSET of sold (never a partition), so this figure
  // can only ever be <= ticketsSoldCount, and a ticket that just came through
  // the door is counted in both.
  const { count: checkedInCountRaw, error: checkedInError } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "checked_in");

  if (checkedInError) {
    throw checkedInError;
  }

  const checkedInCount = checkedInCountRaw ?? 0;

  // Bar width only — never rendered as a number, never mixed into a money
  // figure, so ordinary float division is correct here. The explicit zero
  // branch keeps a brand-new event (0 sold) from producing a NaN width; the
  // clamp keeps the result in the closed range 0..100 for every input.
  const checkedInPercent =
    ticketsSoldCount === 0
      ? 0
      : Math.min(
          100,
          Math.max(0, Math.round((checkedInCount / ticketsSoldCount) * 100)),
        );

  // "Last through the door" — the real, event-scoped list of who most recently
  // came through. Select ONLY the three columns the block renders (id for the
  // React key and the tiebreak, name and moment for the row itself): the
  // attendee email, the paid figure and the token column are deliberately not
  // fetched, because the cheapest guarantee a value cannot land on a screen
  // propped open in a public room is to never pull it over the wire. Same
  // column discipline as the scanner action's LOOKUP_COLUMNS.
  //
  // .eq("event_id", eventId) is what keeps another event's attendees off this
  // page; .eq("status", "checked_in") is the block's whole subject.
  //
  // Ordering is fully specified, not left to Postgres row order: most recent
  // first by the check-in moment, then id descending as an explicit tiebreak so
  // two check-ins in the same clock tick keep a stable order across reloads.
  // The null-handling flag is set so a descending sort does NOT put NULLs
  // first (its Postgres default), which would float a timestamp-less row to the
  // top of a recency list. The five-row bound (D-10-02) keeps a busy door from
  // pushing the rest of the page off screen and from fetching every attendee
  // row for no reader benefit.
  const { data: lastThroughTheDoor, error: lastThroughTheDoorError } =
    await supabase
      .from("tickets")
      .select("id, attendee_name, checked_in_at")
      .eq("event_id", eventId)
      .eq("status", "checked_in")
      .order("checked_in_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(5);

  // Same failure idiom as every read above: a Supabase error throws into
  // src/app/events/error.tsx. It must NOT be coalesced into an empty array —
  // an empty list means "nobody has come through yet", and a failed read must
  // never be able to say that.
  if (lastThroughTheDoorError) {
    throw lastThroughTheDoorError;
  }

  // "Still owed at the door" — the per-currency RESIDUAL door balance across
  // every ticket that owes at the door, issued or checked-in. Phase 17
  // introduced partial and cross-currency door collections, so status =
  // 'checked_in' no longer implies "door balance resolved": a checked-in ticket
  // can still carry a residual after a partial (6000 of 7000) or a
  // cross-currency collection. The read therefore carries NO status filter — a
  // subtotal's ticket count is now "tickets with a positive residual", the
  // accepted semantic under D-10, and "at the door" reads as where the debt is
  // settled. Both money columns are cast to text inside the select string
  // (PostgREST column-cast form) so a decimal string — never a JavaScript
  // double — crosses the wire; that is the whole reason src/lib/amount.ts
  // exists. .not("pay_at_door_amount", "is", null) keeps tickets that owe
  // nothing off the wire entirely.
  //
  // This read is byte-identical to the attendees page's owed read — same
  // select, same filters — so the two surfaces provably see the same rows and
  // sum them through the same residual adapter (DASH-V6-02). .eq("event_id",
  // eventId) is what keeps another event's money off this dashboard. As with
  // every read above, the error is thrown into src/app/events/error.tsx and
  // never coalesced to [] — a failed read must not be able to render as
  // "everyone has paid".
  const { data: owedTickets, error: owedTicketsError } = await supabase
    .from("tickets")
    .select(
      "pay_at_door_amount::text, currency, pay_at_door_collected_amount::text, pay_at_door_collected_currency",
    )
    .eq("event_id", eventId)
    .not("pay_at_door_amount", "is", null);

  if (owedTicketsError) {
    throw owedTicketsError;
  }

  // Every bit of the summation lives in the shared residual adapter — this page
  // does not sum, group by currency or format a money value itself. The
  // attendees page reads the same rows through that same adapter for its
  // "STILL TO COLLECT" line; one residual rule, both surfaces, is the milestone
  // invariant that keeps the two screens from quietly disagreeing about how
  // much money is outstanding.
  const owedSubtotals = sumResidualOwedByCurrency(owedTickets ?? []);

  return (
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-[560px] px-4 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link
            href="/events"
            className={buttonVariants({
              variant: "ghost",
              className: "px-0 justify-start",
            })}
          >
            ← Events
          </Link>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] break-words">
            {event.name}
          </h1>
          <p className="text-[12px] text-muted-foreground break-words">
            {formatEventDateRange(event.starts_at, event.ends_at)} · {event.location}
          </p>
        </div>

        <ScanBar
          size="dashboard"
          label="Scan tickets"
          href={`/events/${eventId}/scan`}
        />

        <div className="flex flex-col gap-3">
          <CountsStrip
            size="dashboard"
            items={[
              {
                value: String(checkedInCount),
                label: "CHECKED IN",
                accent: true,
              },
              { value: String(ticketsSoldCount), label: "TICKETS SOLD" },
            ]}
          />
          <div className="h-[10px] bg-[var(--color-neutral-300)]">
            <div
              className="h-full bg-primary"
              style={{ width: `${checkedInPercent}%` }}
            />
          </div>
          {owedSubtotals.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Nothing owed at the door.
            </p>
          ) : (
            owedSubtotals.map((subtotal) => {
              // Singular/plural for a single outstanding ticket — a screen
              // staff trust should not read as a grammar error.
              const many = subtotal.ticketCount !== 1;
              return (
                <p
                  key={subtotal.currency}
                  className="text-[12px] text-muted-foreground"
                >
                  {subtotal.ticketCount} {many ? "tickets" : "ticket"} still{" "}
                  {many ? "owe" : "owes"}{" "}
                  <span className="font-extrabold">
                    {formatMoney(subtotal.amount, subtotal.currency)}
                  </span>{" "}
                  at the door.
                </p>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              LAST THROUGH THE DOOR
            </p>
            <Link
              href={`/events/${eventId}/attendees`}
              className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-accent-700)]"
            >
              ALL ATTENDEES
            </Link>
          </div>
          {lastThroughTheDoor && lastThroughTheDoor.length > 0 ? (
            <ul className="flex flex-col">
              {lastThroughTheDoor.map((ticket, index) => {
                // Only format a value that is actually a parseable instant —
                // the same guard shape the scanner uses before formatting a
                // check-in time. A NULL checked_in_at renders a blank time
                // span, never an epoch date.
                const checkedInAt = ticket.checked_in_at;
                const timeText =
                  typeof checkedInAt === "string" &&
                  checkedInAt !== "" &&
                  !Number.isNaN(new Date(checkedInAt).getTime())
                    ? formatRelativeTime(checkedInAt)
                    : "";
                return (
                  <li
                    key={ticket.id}
                    className={
                      index === 0
                        ? "flex items-baseline justify-between gap-4 py-3"
                        : "border-t border-border flex items-baseline justify-between gap-4 py-3"
                    }
                  >
                    <span className="text-[12px] font-extrabold break-words">
                      {ticket.attendee_name}
                    </span>
                    <span className="text-[12px] text-muted-foreground shrink-0">
                      {timeText}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[15px] leading-[1.55] text-muted-foreground">
              No check-ins yet — attendees appear here as they come through the door.
            </p>
          )}
        </div>

        {/* The dashboard is a door-staff screen — counts, door list, owed line.
            Ticket-type setup lives on its own screen now (D-04): this single
            outline row is the only thing left of the former inline block. It is
            a navigation affordance, never a ScanBar and never the red default
            (accent is reserved app-wide for the scan action and primary
            submits). Styled through buttonVariants with the outline style as an
            object property, never a JSX attribute — the DOORS-V4-01 gate on
            this file forbids a JSX style attribute here. Shows "· 0" and still
            links when the event has no types (TYPES-V4-06). */}
        <Link
          href={`/events/${eventId}/ticket-types`}
          className={buttonVariants({
            variant: "outline",
            className: "w-full justify-between min-h-[52px] px-4",
          })}
        >
          Ticket types · {ticketTypeCount}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>

        <div className="border-t-2 border-border pt-3 pb-5 grid gap-2">
          <Link
            href={`/events/${eventId}/order`}
            className={buttonVariants({
              variant: "default",
              className: "min-h-[52px] justify-start text-left",
            })}
          >
            Place an order
          </Link>
        </div>
      </div>
    </div>
  );
}
