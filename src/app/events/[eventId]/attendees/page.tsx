import Link from "next/link";
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import { sumOwedByCurrency, sumCollectedByCurrency } from "@/lib/door-money";
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
      "id, attendee_name, attendee_email, ticket_type_id, status, checked_in_at, pay_at_door_amount::text, currency, pay_at_door_collected_amount::text",
    )
    .eq("event_id", eventId)
    .order("attendee_name", { ascending: true })
    .order("id", { ascending: true });

  if (attendeesError) {
    throw attendeesError;
  }

  // "Still to collect" — the dashboard's owed chain, verbatim. status =
  // 'issued' is the exact complement of 'checked_in'. The amount is cast to
  // text inside the select string so a decimal string — never a JS double —
  // crosses the wire. Event-wide: it carries nothing derived from the URL.
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
  const owedSubtotals = sumOwedByCurrency(owedTickets ?? []);
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

  const RESERVATION_LABEL = "RESERVATION";

  // The single definition of "owes money at the door" (D-04): the collected
  // amount absent AND the pay-at-door amount a strictly positive decimal
  // string — tested against src/lib/door-money.ts's anchored shape plus a
  // strictly-positive digit, never a numeric coercion. Called from BOTH the
  // reservation-chip filter and the row's own owed-amount state, so a chip can
  // never select a row the row does not itself mark as owing.
  function rowOwesAtDoor(row: {
    pay_at_door_amount: unknown;
    pay_at_door_collected_amount: unknown;
  }): boolean {
    const doorAmount = row.pay_at_door_amount;
    const collectedAmount = row.pay_at_door_collected_amount;
    const collectedPresent =
      typeof collectedAmount === "string" &&
      /^\d+(?:\.\d{1,2})?$/.test(collectedAmount);
    return (
      !collectedPresent &&
      typeof doorAmount === "string" &&
      /^\d+(?:\.\d{1,2})?$/.test(doorAmount) &&
      /[1-9]/.test(doorAmount)
    );
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

              // The outstanding amount uses the shared rowOwesAtDoor predicate
              // (collected absent AND a strictly-positive decimal string) — one
              // definition, so the chip and this badge can never disagree — then
              // narrows the currency for the shared formatter. Never a
              // numeric coercion. null / "" / "0" / "0.00" / malformed all
              // fall through to "render nothing".
              const doorAmount = attendee.pay_at_door_amount;
              const doorCurrency = attendee.currency;
              const owedLabel =
                rowOwesAtDoor(attendee) &&
                typeof doorAmount === "string" &&
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
