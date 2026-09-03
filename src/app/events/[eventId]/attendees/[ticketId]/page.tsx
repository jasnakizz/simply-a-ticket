import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createServiceClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/amount";
import { formatCheckInClock } from "@/lib/date";
import { attendeeMoneyStrip, attendeePayments } from "@/lib/attendee-money";
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

  const currency = ticket.currency;
  // Render a money string through the shared formatter only when both the value
  // and the ticket currency are present; a null value is a blank cell (D-05).
  const money = (value: string | null) =>
    value !== null && typeof currency === "string"
      ? formatMoney(value, currency)
      : null;

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
  // checked in AND owes nothing left at the door.
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

        {/* 3. Money strip — Owes / Paid / Left, 2px rules top and bottom, 1px
            cell dividers. A null cell renders blank (D-05); Left switches token
            on leftIsPositive. */}
        <div className="grid grid-cols-3 border-y-2 border-border bg-[var(--color-surface)]">
          <div className="flex flex-col gap-1 px-3.5 py-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              Owes
            </p>
            <p className="text-[17px] font-extrabold leading-none tracking-[-0.02em]">
              {money(strip.owes)}
            </p>
          </div>
          <div className="flex flex-col gap-1 border-l border-border px-3.5 py-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              Paid
            </p>
            <p className="text-[17px] font-extrabold leading-none tracking-[-0.02em]">
              {money(strip.paid)}
            </p>
          </div>
          <div className="flex flex-col gap-1 border-l border-border px-3.5 py-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              Left
            </p>
            <p
              className={[
                "text-[17px] font-extrabold leading-none tracking-[-0.02em]",
                strip.leftIsPositive
                  ? "text-[var(--color-accent-700)]"
                  : "text-[var(--color-checked-in)]",
              ].join(" ")}
            >
              {money(strip.left)}
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
            <ul className="flex flex-col">
              {payments.map((payment) => (
                <li
                  key={payment.label}
                  className="flex items-center justify-between border-t border-border py-[11px]"
                >
                  <span className="text-[13.5px] font-semibold">
                    {payment.label}
                  </span>
                  <span className="text-[14px] font-extrabold">
                    {typeof currency === "string"
                      ? formatMoney(payment.amount, currency)
                      : payment.amount}
                  </span>
                </li>
              ))}
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

        {/* 7. Footer — 2px top rule. The manual check-in panel renders for
            every ticket EXCEPT one that is checked in and owes nothing at the
            door: that page is a pure read-out (handoff), so it shows no footer
            actions at all (ADETAIL-V5-05). An inert "Resend ticket email"
            button shows whenever the attendee is not checked in — rendered per
            the handoff, wired to nothing this phase (C-1 / D-10). "Mark as
            paid" is 17-03 (D-11 / C-2), inside the collect panel — not here.
            17-03 fills the owes-branch and the checked-in-still-owes inert CTA
            inside check-in-panel.tsx, with no further change to this file. */}
        <div className="flex flex-col gap-2 border-t-2 border-border pt-3">
          {/* Teaching note: this page stays a Server Component — it renders on
              the request and streams HTML. The panel below is the single
              client island on the page (it is the piece that needs the
              form-action + router hooks); nothing else here is interactive. */}
          {!(statusIsCheckedIn && !strip.leftIsPositive) ? (
            <CheckInPanel
              qrToken={ticket.qr_token}
              eventId={eventId}
              ticketStatus={ticket.status}
              owesAtDoor={strip.owes}
              leftAmount={strip.left}
              currency={ticket.currency}
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
