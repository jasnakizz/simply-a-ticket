import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createServiceClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/amount";
import { formatCheckInClock } from "@/lib/date";
import {
  attendeeMoneyStrip,
  attendeePayments,
  attendeePaymentTotals,
} from "@/lib/attendee-money";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckInPanel } from "./check-in-panel";

// Same reasoning as every other /events page reading live Supabase data: staff
// need the current ticket row, not a build-time snapshot. Living inside the
// /events segment also means this route inherits src/app/events/error.tsx and
// the segment's force-dynamic data pattern for free — no new error boundary.
export const dynamic = "force-dynamic";

export default async function AttendeeDetailPage({
  params,
  searchParams,
}: {
  // Next.js 16 hands both as Promises — typing them up front makes the compiler
  // catch a missing `await` instead of a runtime error.
  params: Promise<{ eventId: string; ticketId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { eventId, ticketId } = await params;

  const supabase = createServiceClient();

  // D-14 / T-17-02 IDOR scoping: the read is scoped by BOTH id and event_id, so
  // a ticket id from another event cannot render under this event's URL.
  // maybeSingle() collapses "no such ticket" and "malformed id Postgres
  // rejects" into the same honest 404 — the ONLY notFound() in this file.
  //
  // Every money column carries `::text` inside the select string so a Postgres
  // `numeric` crosses the wire as a decimal string, never a JS double (D-05).
  // paid_amount::text is the deliberate staff-only exception (ADETAIL-V5-02):
  // this is the one screen in the app allowed to fetch it, safe because the
  // whole /events tree is unlisted and staff-only.
  //
  // The QR token is selected only for the later hidden check-in field (17-02);
  // it is never shown, never put in a URL, and not referenced anywhere in this
  // plan's JSX (ADETAIL-V5-07).
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select(
      "id, event_id, ticket_type_id, attendee_name, attendee_email, status, checked_in_at, issued_at, qr_token, paid_amount::text, pay_at_door_amount::text, currency, pay_at_door_collected_amount::text, pay_at_door_collected_currency, pay_at_door_collected_at",
    )
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (ticketError || !ticket) {
    notFound();
  }

  // Sibling reads follow the attendees-page discipline: `if (error) throw` (the
  // /events error boundary renders the contracted copy). D-14 only requires the
  // ticket miss to 404, so the single notFound() above is reserved for it.
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("name")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    throw eventError;
  }

  const { data: ticketType, error: ticketTypeError } = await supabase
    .from("ticket_types")
    .select("name")
    .eq("id", ticket.ticket_type_id)
    .maybeSingle();

  if (ticketTypeError) {
    throw ticketTypeError;
  }

  // D-13: rebuild the Attendees-list filter query string from this page's own
  // searchParams so Back returns to the exact filtered list the operator was
  // on. Same normalisation attendees/page.tsx does in seededParams(): a
  // repeated `type` key is an array, a lone one a string, absent is []; `owes`
  // is active only for the exact value "1".
  const sp = await searchParams;
  const rawType = sp.type;
  const requestedTypeIds = Array.isArray(rawType)
    ? rawType
    : typeof rawType === "string"
      ? [rawType]
      : [];
  const owesActive = sp.owes === "1";

  const backParams = new URLSearchParams();
  for (const id of requestedTypeIds) {
    backParams.append("type", id);
  }
  if (owesActive) {
    backParams.set("owes", "1");
  }
  const backQuery = backParams.toString();
  const backHref = backQuery
    ? `/events/${eventId}/attendees?${backQuery}`
    : `/events/${eventId}/attendees`;

  const strip = attendeeMoneyStrip(ticket);
  const payments = attendeePayments(ticket);
  // One "Total paid" row per currency present in the rendered payment rows
  // (never a single figure summed across currencies). Derived from the SAME
  // array the list renders, so a Total paid can never disagree with the lines
  // above it.
  const paymentTotals = attendeePaymentTotals(payments);

  const currency = ticket.currency;
  // G-17-1 (operator-directed UAT reversal of D-05, scoped to the 3 money-strip
  // cells ONLY): the strip always renders a figure — a null To pay / Paid at the
  // door / balance shows 0.00, and a ticket carrying no currency falls back to
  // "RSD". Every other null-money surface on this page (the PAYMENTS empty-list
  // sentence, the mismatch note) keeps the null-is-not-zero rule.
  const stripCurrency =
    (typeof currency === "string" && currency !== "" ? currency : null) ?? "RSD";
  // Always returns a formatted string: a null value renders as the zero amount.
  // The optional second argument lets a cell print a currency other than the
  // ticket's (cell 2 prints the currency the door payment was actually taken in,
  // via strip.paidAtDoorCurrency); it defaults to the strip currency so cells 1
  // and 3 pass nothing.
  const money = (value: string | null, currencyCode: string = stripCurrency) =>
    formatMoney(value ?? "0.00", currencyCode);

  // D-12 guard shape, identical to the attendees list: only a non-empty string
  // that parses to a real instant reaches the wall-clock formatter. The
  // check-in time lives ONLY in the status badge below.
  const checkedInAt = ticket.checked_in_at;
  const checkInClock =
    typeof checkedInAt === "string" &&
    checkedInAt !== "" &&
    !Number.isNaN(new Date(checkedInAt).getTime())
      ? formatCheckInClock(checkedInAt)
      : null;
  const isCheckedIn = ticket.status === "checked_in" && checkInClock !== null;
  // Footer render guard (Task 17-02): keyed on the raw status only, NOT the
  // clock guard above — a checked_in row with a NULL checked_in_at is still a
  // read-out, not a check-in target. The panel renders unless the ticket is
  // checked in AND its third strip cell is not strictly positive (nothing more
  // to collect at the door).
  const statusIsCheckedIn = ticket.status === "checked_in";

  // D-15: Issued is date-only ("8 Sep"), rendered inline with an explicit
  // Europe/Belgrade pin (matches formatCheckInClock) behind the same
  // string-and-parseable guard. No year.
  const issuedAt = ticket.issued_at;
  const issuedDate =
    typeof issuedAt === "string" &&
    issuedAt !== "" &&
    !Number.isNaN(new Date(issuedAt).getTime())
      ? new Date(issuedAt).toLocaleDateString("en-GB", {
          timeZone: "Europe/Belgrade",
          day: "numeric",
          month: "short",
        })
      : null;

  return (
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-[560px] px-4 py-6 flex flex-col">
        {/* 1. Header row — Back link carrying the list filter state forward,
            event name as an uppercase eyebrow, 2px bottom rule. */}
        <div className="flex items-baseline justify-between gap-4 pb-3 border-b-2 border-border">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-[14px] font-semibold text-foreground hover:text-[var(--color-accent-700)]"
          >
            <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
            Attendees
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground break-words text-right">
            {event?.name}
          </p>
        </div>

        {/* 2. Title block — name + a badge pair (pass type + status marker). */}
        <div className="flex flex-col gap-2 pt-4 pb-3.5">
          <h1 className="text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] break-words">
            {ticket.attendee_name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {ticketType?.name ? (
              <Badge variant="outline" className="uppercase">
                {ticketType.name}
              </Badge>
            ) : null}
            {isCheckedIn ? (
              <span className="inline-flex items-center px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.09em] bg-[var(--color-checked-in)] text-[var(--color-neutral-100)]">
                Checked in {checkInClock}
              </span>
            ) : (
              <span className="inline-flex items-center border border-[var(--color-divider)] px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.09em] text-foreground">
                Not arrived
              </span>
            )}
          </div>
        </div>

        {/* 3. Money strip — To pay / Paid at the door / a sign-labelled third
            cell, 2px rules top and bottom, 1px cell dividers. A null cell
            renders 0.00 (G-17-1). Cell 2 prints the currency the door payment
            was actually taken in (strip.paidAtDoorCurrency). Cell 3's label is
            strip.balanceLabel (Owes / Settled / Change, driven by the sign of
            its own unclamped value) and it switches token on
            strip.balanceIsPositive — accent above zero, settled-green at or
            below. */}
        <div className="grid grid-cols-3 border-y-2 border-border bg-[var(--color-surface)]">
          <div className="flex flex-col gap-1 px-3.5 py-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              To pay
            </p>
            <p className="text-[17px] font-extrabold leading-none tracking-[-0.02em]">
              {money(strip.toPay)}
            </p>
          </div>
          <div className="flex flex-col gap-1 border-l border-border px-3.5 py-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              Paid at the door
            </p>
            <p className="text-[17px] font-extrabold leading-none tracking-[-0.02em]">
              {money(strip.paidAtDoor, strip.paidAtDoorCurrency)}
            </p>
          </div>
          <div className="flex flex-col gap-1 border-l border-border px-3.5 py-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              {strip.balanceLabel}
            </p>
            <p
              className={[
                "text-[17px] font-extrabold leading-none tracking-[-0.02em]",
                strip.balanceIsPositive
                  ? "text-[var(--color-accent-700)]"
                  : "text-[var(--color-checked-in)]",
              ].join(" ")}
            >
              {money(strip.balance)}
            </p>
          </div>
        </div>

        {/* 4. PAYMENTS — synthesized, at most two rows (D-07). Empty → the fixed
            sentence. A cross-currency collected payment adds the mismatch note
            (D-06) and is never converted. */}
        <div className="flex flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground pt-3.5 pb-2">
            Payments
          </p>
          {payments.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              Nothing paid yet — full amount due at the door.
            </p>
          ) : (
            <ul className="flex flex-col border-t border-border">
              {payments.map((payment) => (
                <li
                  key={payment.label}
                  className="flex items-center justify-between py-[11px]"
                >
                  <span className="text-[13.5px] font-semibold">
                    {payment.label}
                  </span>
                  <span className="text-[14px] font-extrabold">
                    {/* G-17-1 / WR-02: each row prints the currency it was
                        actually recorded in (payment.currency), never the
                        ticket-level currency — a door payment taken in RSD on
                        an EUR ticket reads "… RSD", matching the mismatch note
                        below. */}
                    {formatMoney(payment.amount, payment.currency)}
                  </span>
                </li>
              ))}
              {/* q6i / G-17-3: a single summary row — one label, then the
                  per-currency amounts stacked one below another (mirrors the
                  collectedSubtotals column on the attendees list). Never a
                  cross-currency sum; each figure keyed on its own currency.
                  items-start keeps the label top-aligned against a two-line
                  amount column. */}
              {paymentTotals.length > 0 ? (
                <li className="flex items-start justify-between border-t border-border py-[11px]">
                  <span className="text-[13.5px] font-semibold">Total paid</span>
                  <span className="flex flex-col items-end gap-1">
                    {paymentTotals.map((total) => (
                      <span
                        key={total.currency}
                        className="text-[14px] font-extrabold"
                      >
                        {formatMoney(total.amount, total.currency)}
                      </span>
                    ))}
                  </span>
                </li>
              ) : null}
            </ul>
          )}
          {strip.hasCurrencyMismatch &&
          strip.mismatchAmount !== null &&
          strip.mismatchCurrency !== null ? (
            <p className="text-[11.5px] text-muted-foreground pt-2">
              {formatMoney(strip.mismatchAmount, strip.mismatchCurrency)} taken in
              the other currency — no exchange rate set, so it stays a difference.
            </p>
          ) : null}
        </div>

        {/* 5. NOTE — renders per the handoff but persists nothing this phase
            (D-08): not wired to persistence, no client handler. The note
            column arrives in Phase 18. */}
        <div className="flex flex-col gap-2 border-t-2 border-border pt-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Note
          </p>
          <Textarea
            className="min-h-[74px]"
            placeholder="Anything the door should know — plus one, guest of the band, still owes for a friend…"
          />
        </div>

        {/* 6. TICKET — Issued (date only), Email, Phone (no data source, D-09). */}
        <div className="flex flex-col border-t-2 border-border">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground pt-3.5 pb-2">
            Ticket
          </p>
          <div className="flex items-center justify-between border-t border-border py-[10px] text-[13px]">
            <span className="text-muted-foreground">Issued</span>
            <span className="font-semibold text-right">{issuedDate}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border py-[10px] text-[13px]">
            <span className="text-muted-foreground">Email</span>
            <span className="font-semibold text-right break-all">
              {ticket.attendee_email}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-border py-[10px] text-[13px]">
            <span className="text-muted-foreground">Phone</span>
            <span className="font-semibold text-right">—</span>
          </div>
        </div>

        {/* 7. Footer — 2px top rule. The check-in panel renders for every
            ticket except one that is checked in and already settled at the door
            (that page is a pure read-out — no footer actions, ADETAIL-V5-05).
            The resend-email button below is inert this phase, rendered per the
            handoff (C-1 / D-10). The collect / mark-paid control is 17-03
            (D-11 / C-2) and lives inside the panel, not here. 17-03 fills the
            owes-branch inside check-in-panel.tsx with no further change here. */}
        <div className="flex flex-col gap-2 border-t-2 border-border pt-3">
          {/* Teaching note: this page stays a Server Component — it renders on
              the request and streams HTML. The panel below is the single
              client island on the page (it is the piece that needs the
              form-action + router hooks); nothing else here is interactive. */}
          {!(
            statusIsCheckedIn &&
            (strip.balance === null || strip.balance === "0.00")
          ) ? (
            <CheckInPanel
              qrToken={ticket.qr_token}
              eventId={eventId}
              ticketStatus={ticket.status}
              owesAtDoor={strip.toPay}
              leftAmount={strip.balance}
              currency={ticket.currency}
              ticketId={ticket.id}
              collectedCurrency={ticket.pay_at_door_collected_currency}
              hasCurrencyMismatch={strip.hasCurrencyMismatch}
            />
          ) : null}
          {!statusIsCheckedIn ? (
            <button
              type="button"
              disabled
              className={buttonVariants({
                variant: "secondary",
                className: "min-h-[44px] w-full justify-start text-left",
              })}
            >
              Resend ticket email
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
