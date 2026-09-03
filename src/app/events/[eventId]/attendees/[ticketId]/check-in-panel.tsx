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
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";

import { checkInTicket } from "@/app/actions/check-in";
import type { CheckInState } from "@/app/actions/types";
import { withTimeout } from "@/lib/with-timeout";
import { Button } from "@/components/ui/button";

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
  const owesAtDoorPositive = isPositiveAmount(owesAtDoor);

  // Terminal state from the ACTION RETURN (D-04) — never the stale page-load
  // row. A successful manual check-in.
  if (checkInState.ok) {
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
  // ORIGINAL timestamp if present), no refresh, never a second success.
  if (checkInState.alreadyCheckedIn) {
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

      {owesAtDoorPositive || statusIsCheckedIn ? (
        <div className="flex w-full flex-col gap-2 text-[13px] leading-[1.5] text-muted-foreground">
          {/* 17-03: the balance-due collect sub-form replaces this placeholder */}
          <p>
            Collect {leftAmount ?? owesAtDoor} {currency} at the door — balance-due
            check-in ships in the next step.
          </p>
        </div>
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
