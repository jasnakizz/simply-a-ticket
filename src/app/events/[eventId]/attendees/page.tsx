import Link from "next/link";
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import {
  sumResidualOwedByCurrency,
  sumCollectedByCurrency,
} from "@/lib/door-money";
import { attendeeMoneyStrip } from "@/lib/attendee-money";
import type { AttendeeMoneyRow } from "@/lib/attendee-money";
import { formatMoney } from "@/lib/amount";
import { formatCheckInClock } from "@/lib/date";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "./filter-chip";

// Same reasoning as the dashboard: staff need the current attendee list on
// every request, not a build-time snapshot frozen when Vercel built the app.
export const dynamic = "force-dynamic";

// Next.js 16 hands `params` AND `searchParams` as Promises — typing them as
// such up front makes the compiler catch a missing `await` instead of a
// runtime error. The filter state (11-03) lives entirely in `searchParams`:
// there is no client directive and no hook, the URL is shareable, and the
// browser back button restores the previous filter (D-01).
export default async function AttendeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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

  // The chips' data source. Same query shape the dashboard runs for its
  // ticket-type list, scoped to this event, ordered by creation time. A new
  // type row becomes a new chip label with no code change (ATTENDEE-V3-02).
  const { data: ticketTypes, error: ticketTypesError } = await supabase
    .from("ticket_types")
    .select("id, name")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  // Thrown here, caught by src/app/events/error.tsx — a read failure renders
  // the contracted error copy, never an unhandled exception or a silently
  // chip-less page.
  if (ticketTypesError) {
    throw ticketTypesError;
  }

  // The attendee list. Column discipline: only the columns the rows render,
  // plus attendee_email (ATTENDEE-V3-01 names it). No status filter: a
  // checked-in attendee is still an attendee. Ordering is Postgres's, name
  // A-Z, with an explicit id tiebreak so two identical names keep a
  // reload-stable order (D-09).
  const { data: attendees, error: attendeesError } = await supabase
    .from("tickets")
    .select(
      "id, attendee_name, attendee_email, ticket_type_id, status, checked_in_at, pay_at_door_amount::text, currency, pay_at_door_collected_amount::text, pay_at_door_collected_currency",
    )
    .eq("event_id", eventId)
    .order("attendee_name", { ascending: true })
    .order("id", { ascending: true });

  if (attendeesError) {
    throw attendeesError;
  }

  // "Still to collect" — the RESIDUAL door balance across every ticket, not
  // just the issued ones. Phase 17 introduced partial and cross-currency door
  // collections, so status = 'checked_in' no longer implies "door balance
  // resolved": a checked-in ticket can still carry a residual after a partial
  // (6000 of 7000) or a cross-currency collection (G-17-4 / G-17-8). The read
  // therefore carries NO status filter; it keeps .not("pay_at_door_amount",
  // "is", null) because a ticket with no pay-at-door amount has no residual by
  // definition. Every money column is cast to text so a decimal string —
  // never a JS double — crosses the wire. Event-wide: nothing derived from
  // the URL.
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

  // "Collected at the door" — event-wide, no status filter and no .not(): the
  // shared helper already skips null, zero, malformed and unknown-currency
  // rows. The collected side carries its OWN currency column. Event-wide: it
  // carries nothing derived from the URL.
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
  const owedSubtotals = sumResidualOwedByCurrency(owedTickets ?? []);
  const collectedSubtotals = sumCollectedByCurrency(collectedTickets ?? []);

  // Real ticket-type name per row (D-05). A row whose type id matches nothing
  // renders no badge rather than a fabricated one.
  const ticketTypeNames = new Map(
    (ticketTypes ?? []).map((type) => [type.id, type.name]),
  );

  // ── Filter state: read entirely from the URL, never from client state ─────
  // The awaited query object is a plain record (Next 16): a repeated key is an
  // array, a lone key a string, an absent key undefined. Normalise before any
  // use — never call a string method on the raw value.
  const sp = await searchParams;
  const rawType = sp.type;
  const requestedTypeIds = Array.isArray(rawType)
    ? rawType
    : typeof rawType === "string"
      ? [rawType]
      : [];
  // owes is active only for the exact truthy value the UI-SPEC fixes; anything
  // else (absent, empty, unexpected) is inactive, never an error.
  const owesActive = sp.owes === "1";

  // Intersect the requested type ids against the event's OWN ticket types. A
  // requested id that matches nothing is silently dropped; an unrecognised
  // query key is ignored. Nothing in this block 404s, throws or redirects.
  const validTypeIds = new Set((ticketTypes ?? []).map((type) => type.id));
  const activeTypeIds = requestedTypeIds.filter((id) => validTypeIds.has(id));
  const activeTypeIdSet = new Set(activeTypeIds);
  const hasActiveFilter = activeTypeIds.length > 0 || owesActive;

  const basePath = `/events/${eventId}/attendees`;

  // Seed a URLSearchParams from the NORMALISED active state (never from the raw
  // query object — that is a plain record, not a URLSearchParams). Each chip's
  // href toggles only its own key and carries every other active parameter
  // forward, so stacking chips narrows rather than resets.
  const seededParams = () => {
    const seeded = new URLSearchParams();
    for (const id of activeTypeIds) {
      seeded.append("type", id);
    }
    if (owesActive) {
      seeded.set("owes", "1");
    }
    return seeded;
  };
  const withQuery = (params: URLSearchParams) => {
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const hrefForType = (typeId: string) => {
    const params = seededParams();
    const current = params.getAll("type");
    params.delete("type");
    const nextIds = current.includes(typeId)
      ? current.filter((id) => id !== typeId)
      : [...current, typeId];
    for (const id of nextIds) {
      params.append("type", id);
    }
    return withQuery(params);
  };
  const hrefForOwes = () => {
    const params = seededParams();
    if (params.has("owes")) {
      params.delete("owes");
    } else {
      params.set("owes", "1");
    }
    return withQuery(params);
  };

  // ADETAIL-V5-01 / D-13: each row links to that attendee's detail page,
  // carrying the SAME active-filter query string the chips carry forward
  // (seededParams() already encodes the normalised type ids + owes=1). So
  // tapping a row and then tapping Back on the detail page returns to the exact
  // filtered list the operator was on. href only — no handler prop, no form
  // (phase11-contract Gate 1 / Gate 8).
  const detailHref = (ticketId: string) => {
    const query = seededParams().toString();
    const path = `/events/${eventId}/attendees/${ticketId}`;
    return query ? `${path}?${query}` : path;
  };

  const RESERVATION_LABEL = "RESERVATION";

  // The single definition of "still owes money at the door" (D-02, revised by
  // Phase 19): a pure delegation to attendeeMoneyStrip in
  // src/lib/attendee-money.ts — the same helper the row's own money token now
  // reads, and the same helper the attendee detail page's third money cell
  // reads. balanceIsPositive is true only strictly above zero, so a settled or
  // over-paid row is NOT owing and drops out of the RESERVATION chip; a
  // checked-in attendee who still carries a positive same-currency balance is
  // included — the intended operator meaning of "who do I still need to collect
  // from". Chip predicate and row badge cannot drift onto two predicates.
  function rowOwesAtDoor(row: AttendeeMoneyRow): boolean {
    return attendeeMoneyStrip(row).balanceIsPositive;
  }

  // The visible rows: the fetched list narrowed IN MEMORY only. The type facet
  // is a union (a row passes if no type is active OR its type id is one of the
  // active ids, D-02); the type facet and the reservation facet combine as an
  // intersection (both must pass, D-03). The two door-money totals above are
  // never touched by any of this.
  const visibleAttendees = (attendees ?? []).filter((attendee) => {
    const typeFacetPass =
      activeTypeIdSet.size === 0 || activeTypeIdSet.has(attendee.ticket_type_id);
    const owesFacetPass = !owesActive || rowOwesAtDoor(attendee);
    return typeFacetPass && owesFacetPass;
  });

  // Footer-summary labels in chip order: active ticket types in creation order
  // first, then the reservation label last if active.
  const activeFilterLabels = [
    ...(ticketTypes ?? [])
      .filter((type) => activeTypeIdSet.has(type.id))
      .map((type) => type.name.toUpperCase()),
    ...(owesActive ? [RESERVATION_LABEL] : []),
  ];

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

        <div className="flex flex-wrap gap-2">
          {(ticketTypes ?? []).map((type) => (
            <FilterChip
              key={type.id}
              href={hrefForType(type.id)}
              label={type.name.toUpperCase()}
              active={activeTypeIdSet.has(type.id)}
            />
          ))}
          <FilterChip
            href={hrefForOwes()}
            label={RESERVATION_LABEL}
            active={owesActive}
          />
          {hasActiveFilter ? (
            <Link
              href={basePath}
              className="text-[12px] text-[var(--color-accent-700)]"
            >
              Clear filters
            </Link>
          ) : null}
        </div>

        {visibleAttendees.length > 0 ? (
          <ul className="flex flex-col">
            {visibleAttendees.map((attendee, index) => {
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

              // D-13 right side — four rendered / three logical mutually
              // exclusive states, decided by ONE if/else-if/else chain (see the
              // JSX below) so exactly one renders. Ordering (G-17-8): still-owed
              // FIRST, then change, then "Paid at door". A checked-in
              // pay-at-door attendee who paid only partially, or paid in the
              // other currency, carries BOTH a collected amount and a positive
              // balance — and such a row must read as still owing. "Paid at
              // door" renders only when the ticket-currency balance is fully
              // settled; a same-currency over-payment reads its change back.
              const strip = attendeeMoneyStrip(attendee);

              const collectedAmount = attendee.pay_at_door_collected_amount;
              const isCollected =
                typeof collectedAmount === "string" &&
                /^\d+(?:\.\d{1,2})?$/.test(collectedAmount);

              // The row's two signed figures come straight off the shared strip
              // helper — the same attendeeMoneyStrip the chip predicate and the
              // detail page's third money cell read, so the three surfaces can
              // never disagree. "Owes" -> accent token, "Change" -> the
              // checked-in-green token; every other label falls through to the
              // collected / render-nothing branches. The page formats nothing
              // and carries no currency literal (D-04 / D-05).
              const owedLabel =
                strip.balanceLabel === "Owes" && strip.balance !== null
                  ? formatMoney(strip.balance, strip.balanceCurrency)
                  : null;
              const changeLabel =
                strip.balanceLabel === "Change" && strip.balance !== null
                  ? formatMoney(strip.balance, strip.balanceCurrency)
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
                  <Link
                    href={detailHref(attendee.id)}
                    className="flex flex-1 items-start justify-between gap-3 min-w-0"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[13px] font-extrabold leading-[1.3] break-words">
                        {attendee.attendee_name}
                      </span>
                      {/* <span className="text-[12px] text-muted-foreground break-all">
                        {attendee.attendee_email}
                      </span> */}
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        {/* 260831-keq operator tweak: type badge and arrival status share one row to keep door-phone rows short (diverges from 11-UI-SPEC D-08 item 5 on purpose) */}
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
                    </div>
                    {owedLabel !== null ? (
                      <span className="shrink-0 text-right text-[13px] font-extrabold text-[var(--color-accent-700)]">
                        {owedLabel}
                      </span>
                    ) : changeLabel !== null ? (
                      <span className="shrink-0 text-right text-[13px] font-extrabold text-[var(--color-checked-in)]">
                        Change {changeLabel}
                      </span>
                    ) : isCollected ? (
                      <span className="shrink-0 text-right text-[12px] text-muted-foreground">
                        Paid at door
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : hasActiveFilter ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
              No attendees match this filter
            </h2>
            <p className="text-[15px] leading-[1.55] text-muted-foreground">
              {"No one for this event matches the filters you've selected."}
            </p>
            <Link
              href={basePath}
              className="text-[12px] text-[var(--color-accent-700)]"
            >
              Clear filters
            </Link>
          </div>
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

        {hasActiveFilter && visibleAttendees.length > 0 ? (
          <p className="text-[12px] text-muted-foreground pt-2 break-words">
            {visibleAttendees.length}{" "}
            {visibleAttendees.length === 1 ? "attendee" : "attendees"} ·{" "}
            {activeFilterLabels.join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
