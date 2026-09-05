"use server";

// The return path for a checked-in, overpaid attendee's door balance
// (RETURN-01..04). A sibling of — never a fork of — BOTH the frozen
// checkInTicket action in check-in.ts and the Phase 20 markAsPaid action:
// same shape (module-level zod schema, one formData.get per field, generic
// staff-facing copy on a DB failure with the real error to console.error
// only, an atomic conditional UPDATE whose WHERE clause is the double-submit
// guarantee), never imported from or widened.
//
// This is a Server Action (POST body) rather than a route handler on
// purpose: the returned amount and the ticket identifier must never reach a
// URL, a query string, a redirect/revalidate argument, or a server log line.
// This action navigates and revalidates nothing — the panel calls
// router.refresh() on success and the server-rendered detail page settles
// itself, the same as markAsPaid (D-06 precedent).
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { amountSchema, formatMoney } from "@/lib/amount";
import { subtractCollectedAmount } from "@/lib/door-money";
import type { MarkAsReturnedState } from "@/app/actions/types";

// Six fixed staff-facing sentences — no database detail in any of them.
// Every failure path returns one of these; the real error, if any, goes to
// console.error only. The cap-exceeded message is a per-request field error
// built from the fresh-read cap, never one of these six fixed constants,
// since it must name the actual amount (D-02).
const MARK_AS_RETURNED_NETWORK_ERROR =
  "Something went wrong recording this return. Check your connection and try again.";
const MARK_AS_RETURNED_NOT_CHECKED_IN =
  "This attendee isn't checked in yet — use Mark as paid & check in.";
const MARK_AS_RETURNED_CROSS_CURRENCY =
  "This ticket's door payment was taken in a different currency, so it can't be returned here.";
const MARK_AS_RETURNED_NOTHING_TO_RETURN =
  "There's nothing to return on this ticket.";
const MARK_AS_RETURNED_STALE =
  "Someone already recorded a return on this ticket. Reload the page to see the current balance.";
const MARK_AS_RETURNED_UNREADABLE =
  "This ticket's recorded door payment can't be read. Check it in the database before returning more.";
const MARK_AS_RETURNED_NOT_FOUND =
  "Couldn't find this ticket. Reload the page and try again.";

// Its OWN schema — never checkInSchema or markAsPaidSchema imported or
// widened. The disabled submit button in the UI is convenience; this
// refinement is the real gate, reachable by any hand-crafted POST regardless
// of what the button's disabled state says.
const markAsReturnedSchema = z
  .object({
    ticket_id: z.uuid(),
    event_id: z.uuid(),
    return_amount: amountSchema,
  })
  .superRefine((data, ctx) => {
    if (data.return_amount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["return_amount"],
        message: "Enter the amount you returned.",
      });
      return;
    }
    // A zero entered amount is a refusal, not a silent no-op. A pure string
    // test — no digit in the 1-9 range means the value is all zeros (or,
    // defensively, the "0" literal itself).
    if (!/[1-9]/.test(data.return_amount)) {
      ctx.addIssue({
        code: "custom",
        path: ["return_amount"],
        message: "Enter an amount greater than zero.",
      });
    }
    // A cheap bound on the minor-unit parse — not a business rule, just a
    // sane ceiling before the string ever reaches subtractCollectedAmount's
    // BigInt arithmetic.
    if (data.return_amount.length > 20) {
      ctx.addIssue({
        code: "custom",
        path: ["return_amount"],
        message: "That amount is too long.",
      });
    }
  });

export async function markAsReturned(
  _prevState: MarkAsReturnedState,
  formData: FormData,
): Promise<MarkAsReturnedState> {
  // Individual reads, one per field — spreading FormData would also sweep in
  // React's own action-bookkeeping keys ($ACTION_*).
  const rawTicketId = formData.get("ticket_id");
  const rawEventId = formData.get("event_id");
  const rawReturnAmount = formData.get("return_amount");

  const parsed = markAsReturnedSchema.safeParse({
    ticket_id: rawTicketId ?? "",
    event_id: rawEventId ?? "",
    return_amount: rawReturnAmount ?? "",
  });

  if (!parsed.success) {
    // Echo what the staff member typed so a rejected submit does not blank
    // it (React resets an uncontrolled input to its default once the action
    // settles).
    return {
      errors: z.flattenError(parsed.error).fieldErrors,
      values: { return_amount: String(rawReturnAmount ?? "") },
    };
  }

  const {
    ticket_id: ticketId,
    event_id: eventId,
    return_amount: returnAmount,
  } = parsed.data;

  // Unreachable in practice — markAsReturnedSchema's superRefine already
  // rejects an undefined return_amount, so parsed.success would be false
  // above. This guard exists only to narrow amountSchema's `string |
  // undefined` output type for TypeScript; it carries no arithmetic of its
  // own.
  if (returnAmount === undefined) {
    return {
      errors: { return_amount: ["Enter the amount you returned."] },
      values: { return_amount: "" },
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
    return { formError: MARK_AS_RETURNED_NETWORK_ERROR };
  }
  if (!row) {
    return {
      ok: false,
      notFound: true,
      formError: MARK_AS_RETURNED_NOT_FOUND,
    };
  }

  // Three guards, in order, mirroring markAsPaid's first three exactly.
  if (row.status !== "checked_in") {
    return {
      ok: false,
      notSettleable: true,
      formError: MARK_AS_RETURNED_NOT_CHECKED_IN,
    };
  }

  const ticketCurrency = row.currency;
  if (typeof ticketCurrency !== "string" || ticketCurrency === "") {
    return {
      ok: false,
      notSettleable: true,
      formError: MARK_AS_RETURNED_NOTHING_TO_RETURN,
    };
  }

  // The ONE call that replaces what would otherwise be a
  // residualOwedForTicket-style guard plus an arithmetic call. This action
  // performs no arithmetic and no cap comparison of its own — both live
  // exclusively inside subtractCollectedAmount.
  //
  // WR-02: called BEFORE the cross-currency guard below (reordered from the
  // original guard-then-subtract sequence) so a ticket that simply isn't
  // overpaid gets the accurate "nothing to return" message rather than a
  // currency-mismatch message that can misdescribe why the return was
  // refused. A cross-currency collection never drives doorBalanceForTicket's
  // signed balance negative in the first place (only a same-currency
  // collection can), so checking "not overpaid" first is strictly more
  // accurate and never masks a real cross-currency-and-overpaid case.
  const result = subtractCollectedAmount(row, returnAmount);

  if (!result.ok && result.reason === "not-overpaid") {
    return {
      ok: false,
      notSettleable: true,
      formError: MARK_AS_RETURNED_NOTHING_TO_RETURN,
    };
  }

  const storedCollectedCurrency = row.pay_at_door_collected_currency;
  // RETURN-04: computed directly from the two currency columns — a return
  // always reads and writes in pay_at_door_collected_currency, never the
  // ticket's original owed currency, so a cross-currency ticket cannot have
  // its return misapplied. Reached only once the ticket is confirmed
  // overpaid (the not-overpaid short-circuit above already ran) — per the
  // WR-02 comment above, a cross-currency collection can't have driven the
  // ticket negative anyway, so this guard is now defensive rather than the
  // primary refusal path, kept in case that invariant ever changes.
  if (
    typeof storedCollectedCurrency === "string" &&
    storedCollectedCurrency !== "" &&
    storedCollectedCurrency !== ticketCurrency
  ) {
    return {
      ok: false,
      notSettleable: true,
      formError: MARK_AS_RETURNED_CROSS_CURRENCY,
    };
  }

  if (!result.ok) {
    if (result.reason === "cap") {
      // D-02: a field error naming the actual cap, computed via formatMoney
      // — never a hard-coded currency symbol, never a silent clamp.
      return {
        errors: {
          return_amount: [
            `Can't return more than ${formatMoney(result.capAmount, result.capCurrency)}.`,
          ],
        },
        values: { return_amount: returnAmount },
      };
    }
    // reason === "unparseable" — defensive, unreachable once
    // subtractCollectedAmount has already confirmed the ticket is overpaid.
    console.error(
      "markAsReturned: stored pay_at_door_collected_amount is present but unreadable",
      row.pay_at_door_collected_amount,
    );
    return { formError: MARK_AS_RETURNED_UNREADABLE };
  }

  const nextAmount = result.amount;

  // One clock reading, written explicitly — an UPDATE fires no column
  // default.
  const now = new Date().toISOString();

  // Exactly the three door-collection columns, never the check-in state or
  // its timestamp. The collected-currency column is added to the patch ONLY
  // on the null-snapshot branch — unreachable in practice for an overpaid
  // ticket (money was already collected to be overpaid), kept for
  // structural parity with mark-as-paid.ts, zero behaviour cost.
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
    return { formError: MARK_AS_RETURNED_NETWORK_ERROR };
  }

  if (updated) {
    return {
      ok: true,
      collectedAmount: updated.pay_at_door_collected_amount,
      collectedCurrency: updated.pay_at_door_collected_currency,
    };
  }

  // Zero rows changed — the snapshot went stale between the read and the
  // write (a concurrent return or settle landed in between, or this is a
  // double submit). Disambiguate with a plain, unscoped-by-snapshot re-read.
  const { data: current, error: currentError } = await supabase
    .from("tickets")
    .select("status, pay_at_door_collected_amount::text, pay_at_door_collected_currency")
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (currentError) {
    console.error(currentError);
    return { formError: MARK_AS_RETURNED_NETWORK_ERROR };
  }

  if (current?.status === "checked_in") {
    // Its own named outcome — never the already-checked-in flag, never a
    // bare network-error string. Staff should understand someone else
    // already recorded a return, not think the app is broken.
    return { ok: false, staleBalance: true, formError: MARK_AS_RETURNED_STALE };
  }

  // Ticket state changed underneath in some other way — defensive.
  return {
    ok: false,
    notFound: true,
    formError: MARK_AS_RETURNED_NOT_FOUND,
  };
}
