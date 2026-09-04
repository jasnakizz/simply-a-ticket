"use server";

// The settle path for an already-checked-in attendee's outstanding door
// balance (PAID-V6). A sibling of — never a fork of — the frozen
// checkInTicket action in check-in.ts: same shape (module-level zod schema,
// one formData.get per field, generic staff-facing copy on a DB failure with
// the real error to console.error only, an atomic conditional UPDATE whose
// WHERE clause is the double-submit guarantee), never imported from or
// widened.
//
// This is a Server Action (POST body) rather than a route handler on purpose:
// the amount collected and the ticket identifier must never reach a URL, a
// query string, a redirect/revalidate argument, or a server log line. This
// action navigates and revalidates nothing — the panel calls
// router.refresh() on success and the server-rendered detail page settles
// itself (D-06).
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { amountSchema } from "@/lib/amount";
import { residualOwedForTicket, addCollectedAmount } from "@/lib/door-money";
import type { MarkAsPaidState } from "@/app/actions/types";

// Six fixed staff-facing sentences — no database detail in any of them. Every
// failure path returns one of these; the real error, if any, goes to
// console.error only (T-20-07).
const MARK_AS_PAID_NETWORK_ERROR =
  "Something went wrong recording this payment. Check your connection and try again.";
const MARK_AS_PAID_NOT_CHECKED_IN =
  "This attendee isn't checked in yet — use Mark as paid & check in.";
const MARK_AS_PAID_CROSS_CURRENCY =
  "This ticket's door payment was taken in a different currency, so it can't be settled here.";
const MARK_AS_PAID_NOTHING_OWED =
  "There's nothing left to collect on this ticket.";
const MARK_AS_PAID_STALE =
  "Someone already recorded a payment on this ticket. Reload the page to see the current balance.";
const MARK_AS_PAID_UNREADABLE =
  "This ticket's recorded door payment can't be read. Check it in the database before collecting more.";

// Its OWN schema (D-04) — never checkInSchema imported or widened. The
// disabled submit button in the UI is convenience; this refinement is the
// real gate, reachable by any hand-crafted POST regardless of what the
// button's disabled state says.
const markAsPaidSchema = z
  .object({
    ticket_id: z.uuid(),
    event_id: z.uuid(),
    settle_amount: amountSchema,
  })
  .superRefine((data, ctx) => {
    if (data.settle_amount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["settle_amount"],
        message: "Enter the amount you collected.",
      });
      return;
    }
    // D-04: a zero entered amount is a refusal, not a silent no-op that only
    // bumps the collection timestamp. A pure string test — no digit in the
    // 1-9 range means the value is all zeros (or, defensively, the "0"
    // literal itself).
    if (!/[1-9]/.test(data.settle_amount)) {
      ctx.addIssue({
        code: "custom",
        path: ["settle_amount"],
        message: "Enter an amount greater than zero.",
      });
    }
    // A cheap bound on the minor-unit parse (Phase 16 input-limit
    // precedent) — not a business rule, just a sane ceiling before the
    // string ever reaches addCollectedAmount's BigInt arithmetic.
    if (data.settle_amount.length > 20) {
      ctx.addIssue({
        code: "custom",
        path: ["settle_amount"],
        message: "That amount is too long.",
      });
    }
  });

export async function markAsPaid(
  _prevState: MarkAsPaidState,
  formData: FormData,
): Promise<MarkAsPaidState> {
  // Individual reads, one per field — spreading FormData would also sweep in
  // React's own action-bookkeeping keys ($ACTION_*).
  const rawTicketId = formData.get("ticket_id");
  const rawEventId = formData.get("event_id");
  const rawSettleAmount = formData.get("settle_amount");

  const parsed = markAsPaidSchema.safeParse({
    ticket_id: rawTicketId ?? "",
    event_id: rawEventId ?? "",
    settle_amount: rawSettleAmount ?? "",
  });

  if (!parsed.success) {
    // Echo what the staff member typed so a rejected submit does not blank
    // it (React resets an uncontrolled input to its default once the action
    // settles).
    return {
      errors: z.flattenError(parsed.error).fieldErrors,
      values: { settle_amount: String(rawSettleAmount ?? "") },
    };
  }

  const {
    ticket_id: ticketId,
    event_id: eventId,
    settle_amount: settleAmount,
  } = parsed.data;

  // Unreachable in practice — markAsPaidSchema's superRefine already rejects
  // an undefined settle_amount, so parsed.success would be false above. This
  // guard exists only to narrow amountSchema's `string | undefined` output
  // type for TypeScript; it carries no arithmetic of its own.
  if (settleAmount === undefined) {
    return {
      errors: { settle_amount: ["Enter the amount you collected."] },
      values: { settle_amount: "" },
    };
  }

  const supabase = createServiceClient();

  // The server-side read — this is what makes "never trust a client-echoed
  // existing figure" literally true. Every money column crosses the wire
  // with an explicit ::text cast so a Postgres numeric never becomes a JS
  // double.
  const { data: row, error: readError } = await supabase
    .from("tickets")
    .select(
      "status, currency, pay_at_door_amount::text, pay_at_door_collected_amount::text, pay_at_door_collected_currency",
    )
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (readError) {
    console.error(readError);
    return { formError: MARK_AS_PAID_NETWORK_ERROR };
  }
  if (!row) {
    return { ok: false, notFound: true };
  }

  // Four guards, in order, each its own named outcome (never a shared one).
  if (row.status !== "checked_in") {
    return {
      ok: false,
      notSettleable: true,
      formError: MARK_AS_PAID_NOT_CHECKED_IN,
    };
  }

  const ticketCurrency = row.currency;
  if (typeof ticketCurrency !== "string" || ticketCurrency === "") {
    return {
      ok: false,
      notSettleable: true,
      formError: MARK_AS_PAID_NOTHING_OWED,
    };
  }

  const storedCollectedCurrency = row.pay_at_door_collected_currency;
  // PAID-V6-05: computed directly from the two currency columns, deliberately
  // stricter than the strip's hasCurrencyMismatch (which also requires a
  // parseable collected amount) — a corrupt-but-present cross-currency stamp
  // must still refuse the settle, not fall through to it.
  if (
    typeof storedCollectedCurrency === "string" &&
    storedCollectedCurrency !== "" &&
    storedCollectedCurrency !== ticketCurrency
  ) {
    return {
      ok: false,
      notSettleable: true,
      formError: MARK_AS_PAID_CROSS_CURRENCY,
    };
  }

  // The Phase 18 module owns the residual rule; this action performs no
  // arithmetic of its own to decide whether anything is still owed.
  if (residualOwedForTicket(row) === null) {
    return {
      ok: false,
      notSettleable: true,
      formError: MARK_AS_PAID_NOTHING_OWED,
    };
  }

  const nextAmount = addCollectedAmount(
    row.pay_at_door_collected_amount,
    settleAmount,
  );
  if (nextAmount === null) {
    console.error(
      "markAsPaid: stored pay_at_door_collected_amount is present but unreadable",
      row.pay_at_door_collected_amount,
    );
    return { formError: MARK_AS_PAID_UNREADABLE };
  }

  // One clock reading, written explicitly — an UPDATE fires no column
  // default.
  const now = new Date().toISOString();

  // Exactly the three door-collection columns, never the check-in state or
  // its timestamp. The collected-currency column is added to the patch ONLY
  // on the null-snapshot branch (a first-ever collection reaching this
  // action) — see the plan's third deviation note: leaving it NULL would
  // hide the money from sumCollectedByCurrency's EUR/RSD allowlist.
  const patch: Record<string, string> = {
    pay_at_door_collected_amount: nextAmount,
    pay_at_door_collected_at: now,
  };
  const collectedAmountSnapshot = row.pay_at_door_collected_amount;
  const collectedCurrencySnapshot = row.pay_at_door_collected_currency;
  if (collectedCurrencySnapshot === null) {
    patch.pay_at_door_collected_currency = ticketCurrency;
  }

  // THE guarded UPDATE (D-01's compare-and-swap) — this predicate set IS the
  // double-submit defence and must not be replaced by a read-then-write
  // gate. supabase-js has no "is not distinct from" builder, so each
  // snapshot predicate branches between .is(column, null) and
  // .eq(column, snapshot) on a mutable query reference.
  let query = supabase
    .from("tickets")
    .update(patch)
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .eq("status", "checked_in");

  query =
    collectedAmountSnapshot === null
      ? query.is("pay_at_door_collected_amount", null)
      : query.eq("pay_at_door_collected_amount", collectedAmountSnapshot);

  query =
    collectedCurrencySnapshot === null
      ? query.is("pay_at_door_collected_currency", null)
      : query.eq(
          "pay_at_door_collected_currency",
          collectedCurrencySnapshot,
        );

  // maybeSingle, never the strict single-row terminator: zero rows is the
  // expected signal for a stale snapshot, not a throw.
  const { data: updated, error: updateError } = await query
    .select("pay_at_door_collected_amount::text, pay_at_door_collected_currency")
    .maybeSingle();

  if (updateError) {
    console.error(updateError);
    return { formError: MARK_AS_PAID_NETWORK_ERROR };
  }

  if (updated) {
    return {
      ok: true,
      collectedAmount: updated.pay_at_door_collected_amount,
      collectedCurrency: updated.pay_at_door_collected_currency,
    };
  }

  // Zero rows changed — the snapshot went stale between the read and the
  // write (a concurrent settle landed in between, or this is a double
  // submit). Disambiguate with a plain, unscoped-by-snapshot re-read.
  const { data: current, error: currentError } = await supabase
    .from("tickets")
    .select("status, pay_at_door_collected_amount::text, pay_at_door_collected_currency")
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (currentError) {
    console.error(currentError);
    return { formError: MARK_AS_PAID_NETWORK_ERROR };
  }

  if (current?.status === "checked_in") {
    // Its own named outcome (PAID-V6-04 / the plan's <specifics>) — never
    // the already-checked-in flag, never a bare network-error string. Staff
    // should understand someone else already recorded a payment, not think
    // the app is broken.
    return { ok: false, staleBalance: true, formError: MARK_AS_PAID_STALE };
  }

  // Ticket state changed underneath in some other way — defensive.
  return { ok: false, notFound: true };
}
