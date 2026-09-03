"use client";

// The one interactive island on the attendee detail page. It is "use client"
// only because it needs the useActionState / useRouter hooks — the real work
// (zod validation, the atomic exactly-once UPDATE, the write) all still happens
// server-side in the frozen checkInTicket Server Action. This file wires a form
// to it and renders what comes back.
//
// D-01: the manual check-in reuses checkInTicket UNCHANGED and inline — a plain
// import, wired with useActionState + <form action> + a hidden `token` (the
// qr_token) and a hidden `event_id`. No navigation to the scanner route.
//
// D-03: the scanner's checkInWithGuard reducer + withTimeout wrap are MIRRORED
// here by hand — scanner-client.tsx is source-pinned and frozen, so nothing is
// imported from it. `withTimeout` itself IS imported (src/lib/with-timeout.ts
// is a plain node module, not part of the frozen machine).
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, CircleAlert } from "lucide-react";

import { checkInTicket } from "@/app/actions/check-in";
import type { CheckInState } from "@/app/actions/types";
import { amountSchema, toTwoDecimals } from "@/lib/amount";
import { withTimeout } from "@/lib/with-timeout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The empty reducer seed — same shape as the scanner's initialCheckIn.
const initialCheckIn: CheckInState = {};

// D-03 / D-05 sibling value: the client-side wait bound that turns a silent
// hang on "Checking in…" into a visible failure state. One value to tune if a
// slow-but-live link trips a false positive.
const TIMEOUT_MS = 10_000;

// D-03: a BYTE-FOR-BYTE copy of the string checkInTicket already returns for a
// caught database error (src/app/actions/check-in.ts). Copying it rather than
// inventing new copy means the panel introduces no new user-visible failure
// wording; the Task 3 source gate asserts this literal is present in
// check-in.ts so a future edit to one and not the other fails by name.
const CHECKIN_NETWORK_ERROR =
  "Something went wrong checking this ticket in. Check your connection and try again.";

// Mirrored from the scanner's / order form's FieldError — identical body, not
// imported. role="alert" so a screen reader announces it; near-black text
// because red is reserved for a real external system failure.
function FieldError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-center gap-1 text-[13px] text-foreground"
    >
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {message}
    </p>
  );
}

// D-03: the reducer actually passed to useActionState — a CLIENT wrapper around
// checkInTicket, never the raw action. A rejected / hung / timed-out check-in
// POST raised inside the useActionState transition otherwise bubbles to
// src/app/events/error.tsx and collapses the subtree. Catching HERE, inside the
// reducer, and returning a CheckInState is the only fix. The caught value is
// NEVER read (no message / code / stack / payload reaches rendered state) and
// this never re-throws. The values echo shape is copied from check-in.ts so a
// hand-typed collected amount + currency survive a network-failed balance-due
// submit (17-03 uses those fields; this plan ships only the plain path).
async function checkInWithGuard(
  prevState: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  try {
    return await withTimeout(checkInTicket(prevState, formData), TIMEOUT_MS);
  } catch {
    return {
      formError: CHECKIN_NETWORK_ERROR,
      values: {
        collected_amount: String(formData.get("collected_amount") ?? ""),
        collected_currency: String(formData.get("collected_currency") ?? ""),
      },
    };
  }
}

// Format an action-returned instant string to Belgrade HH:MM without a numeric
// round-trip — the same guard shape the page uses for the status badge. Returns
// null (caller falls back to a timeless "Checked in") when the value is absent
// or unparseable, so a status='checked_in' row with a NULL checked_in_at never
// renders an epoch date.
function formatCheckInTime(raw: string | undefined): string | null {
  if (
    typeof raw !== "string" ||
    raw === "" ||
    Number.isNaN(new Date(raw).getTime())
  ) {
    return null;
  }
  return new Date(raw).toLocaleTimeString("en-GB", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Pure string test — a well-formed non-negative two-decimal amount with at
// least one non-zero digit. No Number() / parseFloat: money never goes through
// a float on this page.
function isPositiveAmount(raw: string | null): boolean {
  if (typeof raw !== "string") return false;
  const text = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return false;
  return /[1-9]/.test(text);
}

export function CheckInPanel({
  qrToken,
  eventId,
  ticketStatus,
  owesAtDoor,
  leftAmount,
  currency,
}: {
  qrToken: string;
  eventId: string;
  ticketStatus: string;
  owesAtDoor: string | null;
  leftAmount: string | null;
  currency: string | null;
}) {
  // useActionState is the browser-side hook that tracks the Server Action's
  // pending flag and its returned value across a re-render — the real
  // validation, the atomic UPDATE and the write all still run server-side in
  // checkInTicket; this file only wires the form to it and renders what comes
  // back. Kept on one line so the wrapper wiring is greppable as one token.
  const [checkInState, checkInAction, checkInPending] = useActionState(checkInWithGuard, initialCheckIn);
  const router = useRouter();

  // D-04: router.refresh() re-runs the parent Server Component's data read (a
  // fresh request) without a full navigation, so the page settles into the
  // post-write canonical state (green badge, Left recomputed, footer control
  // gone). It does NOT reset useActionState — that is why the confirmation also
  // renders directly from checkInState.ok below. Fires ONLY on success, once,
  // in an effect keyed on checkInState.ok — never on a formError / field-error
  // / notFound / alreadyCheckedIn return, and never unconditionally.
  useEffect(() => {
    if (checkInState.ok) router.refresh();
  }, [checkInState.ok, router]);

  const statusIsCheckedIn = ticketStatus === "checked_in";
  // The collect-vs-plain branch keys on the leftAmount prop, which now carries
  // the detail strip's third-cell value (strip.balance). That cell can be a
  // strictly positive "Owes" figure, a settled "0.00", a negative change-owed
  // figure, or a cross-currency straight copy of cell 1. isPositiveAmount is a
  // pure string test whose anchored decimal admits no leading minus and needs a
  // non-zero digit, so all three non-positive shapes (settled zero, negative
  // change, and a zero copy) fall through to the plain manual check-in control
  // for free — a "Collect …" button appears only for a strictly positive third
  // cell. Do not loosen that regex. owesAtDoor stays used in balanceDisplay.
  const leftPositive = isPositiveAmount(leftAmount);

  // Collect sub-form UI state (D-02 / handoff). collectOpen: the collapsed
  // `Collect <Left> +` button vs the expanded panel — expands in place, nothing
  // navigates. paymentCollected: the gate; defaults ON for the detail page
  // (staff are standing with the person and the cash) — unticking parks the
  // form, it is not a free check-in. amountHint: a non-blocking client-side
  // shape warning from the shared amountSchema.
  const [collectOpen, setCollectOpen] = useState(false);
  const [paymentCollected, setPaymentCollected] = useState(true);
  const [amountHint, setAmountHint] = useState<string | null>(null);

  // Terminal state from the ACTION RETURN (D-04) — never the stale page-load
  // row. A successful manual check-in.
  //
  // G-17-5: gated on `ticketStatus !== "checked_in"` so this transient
  // confirmation renders only in the brief window between a successful submit
  // and router.refresh() propagating the checked-in status prop. Once the prop
  // flips, this early-return (and the alreadyCheckedIn one below) is skipped and
  // the panel falls through to the server-state-driven checked-in view (C-2:
  // collapsed "Collect <Left>" → expand → inert "Mark as paid") with no manual
  // page reload. The transient confirmation before the refresh lands is the
  // intended feedback and is kept.
  if (checkInState.ok && ticketStatus !== "checked_in") {
    const time = formatCheckInTime(checkInState.checkedInAt);
    return (
      <div className="flex w-full flex-col gap-1">
        <p className="text-[13px] font-semibold uppercase tracking-[0.09em] text-[var(--color-checked-in)]">
          {time ? `Checked in · ${time}` : "Checked in"}
        </p>
        {checkInState.attendeeName ? (
          <p className="text-[15px] font-semibold break-words">
            {checkInState.attendeeName}
          </p>
        ) : null}
      </div>
    );
  }

  // A second manual attempt, or a race with a scan, resolves through the atomic
  // UPDATE and returns alreadyCheckedIn — render it from the return (with the
  // ORIGINAL timestamp if present), no refresh, never a second success. Same
  // G-17-5 gate as the ok branch above: clears once router.refresh() propagates
  // the checked-in status prop, so the panel settles into the server-driven view.
  if (checkInState.alreadyCheckedIn && ticketStatus !== "checked_in") {
    const time = formatCheckInTime(checkInState.checkedInAt);
    return (
      <div className="flex w-full flex-col gap-1">
        <p
          role="status"
          className="text-[13px] font-semibold uppercase tracking-[0.09em] text-foreground"
        >
          {time ? `Already checked in · ${time}` : "Already checked in"}
        </p>
        {checkInState.attendeeName ? (
          <p className="text-[15px] font-semibold break-words">
            {checkInState.attendeeName}
          </p>
        ) : null}
      </div>
    );
  }

  // Balance prefill — string-only, never a numeric round-trip. Left (the
  // outstanding figure) drives the label and the amount default; a rejected
  // submit re-applies whatever the staff member typed via checkInState.values.
  const balanceDisplay = toTwoDecimals(leftAmount ?? owesAtDoor ?? "");
  // Resolved currency for the collapsed collect button label. Logical-or (not
  // nullish) so an empty-string currency column also falls back — the button
  // must never render an amount followed by a trailing space and no code.
  const resolvedCurrency = currency || "RSD";
  const amountDefault = checkInState.values?.collected_amount || balanceDisplay;
  const currencyDefault =
    checkInState.values?.collected_currency || currency || "RSD";

  // The revealed amount + currency fields — identical markup whether the CTA is
  // the live "Mark as paid & check in" or the inert "Mark as paid" (C-2 / D-11).
  const collectFields = (
    <>
      {/* Whole row is a ≥44px tap target. Default ON (D-02 / handoff). */}
      <label className="flex min-h-11 w-full items-center gap-2">
        <Checkbox
          name="payment_collected"
          checked={paymentCollected}
          onCheckedChange={(value) => setPaymentCollected(value === true)}
        />
        <span className="text-[13px] font-semibold leading-[1.4]">
          Payment collected
        </span>
      </label>
      {checkInState.errors?.payment_collected?.[0] ? (
        <FieldError message={checkInState.errors.payment_collected[0]} />
      ) : null}

      {/* Unchecking parks the form: fields + CTA disabled, not a free check-in. */}
      <div
        className={
          paymentCollected
            ? "flex w-full flex-col gap-4"
            : "flex w-full flex-col gap-4 opacity-45"
        }
      >
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="collected_amount" className="text-[13px] font-semibold">
            Amount collected
          </Label>
          <Input
            id="collected_amount"
            name="collected_amount"
            inputMode="decimal"
            defaultValue={amountDefault}
            disabled={!paymentCollected}
            onBlur={(event) => {
              // Client-side pre-validation ONLY — reuses the shared amountSchema
              // so the shape rule + message live in one place. Non-blocking: the
              // submit is gated by the checkbox, and checkInSchema.superRefine in
              // the frozen action is the real gate.
              const result = amountSchema.safeParse(event.currentTarget.value);
              setAmountHint(
                result.success
                  ? null
                  : "Enter a non-negative amount with up to 2 decimal places.",
              );
            }}
          />
          {checkInState.errors?.collected_amount?.[0] ? (
            <FieldError message={checkInState.errors.collected_amount[0]} />
          ) : amountHint ? (
            <p className="text-[13px] text-muted-foreground">{amountHint}</p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2">
          <Label
            htmlFor="collected_currency"
            className="text-[13px] font-semibold"
          >
            Currency
          </Label>
          {/* key tied to the echoed value so a rejected submit re-applies the
              staff member's choice — same remount trick as the scanner. */}
          <Select
            key={currencyDefault}
            name="collected_currency"
            defaultValue={currencyDefault}
            disabled={!paymentCollected}
          >
            <SelectTrigger id="collected_currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="RSD">RSD</SelectItem>
            </SelectContent>
          </Select>
          {checkInState.errors?.collected_currency?.[0] ? (
            <FieldError message={checkInState.errors.collected_currency[0]} />
          ) : null}
        </div>
      </div>
    </>
  );

  // The expanded collect panel. C-3: NO "Balance due: X" bar — a subtle gray
  // divider carrying only a fold-up chevron that collapses back to the button.
  const collectPanel = (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-end border-t border-[var(--color-divider)] pt-2">
        <button
          type="button"
          onClick={() => setCollectOpen(false)}
          aria-label="Collapse payment panel"
          className="inline-flex min-h-[28px] items-center px-1.5 text-muted-foreground"
        >
          <ChevronUp aria-hidden="true" className="size-4" />
        </button>
      </div>
      {statusIsCheckedIn ? (
        // C-2 / D-11 / ADETAIL-V5-06: an already-checked-in attendee who still
        // owes gets a "Mark as paid" CTA only (no "& check in") and it is inert
        // this phase — wiring it needs a new tickets UPDATE, which ADETAIL-V5-06
        // bars; deferred to Phase 18. No <form action>, no balance_due submit.
        <div className="flex w-full flex-col gap-4">
          {collectFields}
          <Button
            type="button"
            disabled
            className="min-h-[44px] w-full justify-start text-left"
          >
            Mark as paid
          </Button>
        </div>
      ) : (
        <form action={checkInAction} className="flex w-full flex-col gap-4">
          <input type="hidden" name="token" defaultValue={qrToken} />
          <input type="hidden" name="event_id" defaultValue={eventId} />
          {/* The path marker checkInSchema.superRefine switches on — present
              ONLY on this balance-due branch, never on the plain path (D-02). */}
          <input type="hidden" name="balance_due" defaultValue="true" />
          {collectFields}
          <Button
            type="submit"
            disabled={!paymentCollected || checkInPending}
            className="min-h-[44px] w-full justify-start text-left"
          >
            {checkInPending ? "Checking in…" : "Mark as paid & check in"}
          </Button>
        </form>
      )}
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-3">
      {checkInState.formError ? (
        <p
          role="alert"
          className="flex items-center gap-1 text-[15px] leading-[1.55] text-destructive break-words"
        >
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {checkInState.formError}
        </p>
      ) : null}
      {checkInState.errors?.token?.[0] ? (
        <FieldError message={checkInState.errors.token[0]} />
      ) : null}
      {checkInState.errors?.event_id?.[0] ? (
        <FieldError message={checkInState.errors.event_id[0]} />
      ) : null}

      {statusIsCheckedIn || leftPositive ? (
        collectOpen ? (
          collectPanel
        ) : (
          <Button
            type="button"
            onClick={() => setCollectOpen(true)}
            className="min-h-[44px] w-full justify-between text-left"
          >
            <span>
              Collect {balanceDisplay} {resolvedCurrency}
            </span>
            <span aria-hidden="true" className="opacity-80">
              +
            </span>
          </Button>
        )
      ) : (
        <form action={checkInAction} className="flex w-full flex-col">
          <input type="hidden" name="token" defaultValue={qrToken} />
          <input type="hidden" name="event_id" defaultValue={eventId} />
          <Button
            type="submit"
            variant="secondary"
            disabled={checkInPending}
            className="min-h-[44px] w-full justify-start text-left"
          >
            {checkInPending ? "Checking in…" : "Check in manually"}
          </Button>
        </form>
      )}
    </div>
  );
}
