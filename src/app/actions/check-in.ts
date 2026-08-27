"use server";

// The scanner's two server entry points. Mirrors createOrder's shape
// (module-level zod schema, one formData.get per field, safeParse +
// z.flattenError, generic staff-facing copy on a DB failure with the real
// error to console.error only) and adds the one genuinely new pattern this
// phase introduces: an atomic conditional UPDATE whose WHERE clause is the
// exactly-once guarantee (CHECKIN-02 / PROMISES.md).
//
// Both entry points are Server Actions (POST body) rather than a GET route
// handler on purpose: the qr_token is the app's one secret and must never
// reach a URL, a query string, a redirect/revalidate argument, or a server
// log line. Neither action navigates or revalidates — the scanner stays on
// the page and updates its own state from the returned value.
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { amountSchema } from "@/lib/amount";
import { classifyScan, type ScanResult } from "@/lib/scan-result";
import type { CheckInState } from "@/app/actions/types";

// A blank or whitespace-only decode is an ordinary "not a ticket" outcome —
// it must never reach the database as a query on an empty value.
const tokenSchema = z.string().trim().min(1);

const checkInSchema = z
  .object({
    token: z.string().trim().min(1),
    event_id: z.uuid(),
    // The client marks which path it is on: a hidden "true" on the balance-due
    // form, absent on the plain form. This is client-controlled and the server
    // does not re-derive the balance from the row — the failure mode is
    // self-defeating (a caller who lies and omits the marker gets a plain
    // check-in that records no collection, which is exactly what omitting the
    // confirmation would get them, and the ticket is still checked in exactly
    // once). Recorded as a flagged assumption in 03-04-PLAN.md.
    balance_due: z.enum(["true"]).optional(),
    // An HTML checkbox submits the string "on" when ticked and is absent
    // entirely when not — an optional literal, not a boolean.
    payment_collected: z.enum(["on"]).optional(),
    // The same anchored decimal rule the order form uses, shared from
    // @/lib/amount so there is one pattern and one message. Stays a string.
    collected_amount: amountSchema.optional(),
    collected_currency: z.enum(["EUR", "RSD"]).optional(),
  })
  .superRefine((data, ctx) => {
    // CHECKIN-03: on the balance-due path the confirmation, the collected
    // amount and the collected currency are ALL required, and their absence is
    // a field error — not a silent pass. Expressed here, at the schema level,
    // so it runs on every submission and a later edit to the handler cannot
    // step around it. The disabled button in the UI is convenience; this
    // refinement is what makes "not checked in until staff confirm payment"
    // literally true (a form POST is reachable without the button).
    if (data.balance_due !== "true") return;
    if (data.payment_collected !== "on") {
      ctx.addIssue({
        code: "custom",
        path: ["payment_collected"],
        message:
          "Confirm you collected the payment before checking this ticket in.",
      });
    }
    if (data.collected_amount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["collected_amount"],
        message: "Enter the amount you collected.",
      });
    }
    if (data.collected_currency === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["collected_currency"],
        message: "Choose the currency you collected.",
      });
    }
  });

// The exact column list the door screen is allowed to see. The attendee's
// email column and the internal paid-amount bookkeeping column are
// deliberately absent from every select in this file (decision D-08): the
// cheapest way to guarantee neither can land on a screen held up at a
// public door is to never fetch them.
const LOOKUP_COLUMNS =
  "event_id, ticket_type_id, attendee_name, status, checked_in_at, pay_at_door_amount, currency";

export async function lookupTicket(
  rawToken: string,
  eventId: string,
): Promise<ScanResult | { kind: "error" }> {
  const parsed = tokenSchema.safeParse(rawToken);
  if (!parsed.success) return { kind: "not_found" };

  const supabase = createServiceClient();

  // Filter by qr_token ALONE — deliberately diverging from the
  // .eq("id").eq("event_id") pattern the order/confirmation pages use to
  // hide a foreign row. Hiding it here would collapse "wrong event" into
  // "not found" and destroy the distinction D-11 requires. The event
  // comparison happens in classifyScan instead; the SQL-level event scoping
  // that actually matters is enforced on the write, in checkInTicket.
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select(LOOKUP_COLUMNS)
    .eq("qr_token", parsed.data)
    .maybeSingle();

  if (error) {
    console.error(error);
    return { kind: "error" };
  }
  if (!ticket) return { kind: "not_found" };

  // Only reach for the display name when the ticket is actually for this
  // event and still issued — the other outcomes do not render a ticket type.
  let ticketTypeName: string | null = null;
  if (ticket.event_id === eventId && ticket.status === "issued") {
    const { data: ticketType, error: ticketTypeError } = await supabase
      .from("ticket_types")
      .select("name")
      .eq("id", ticket.ticket_type_id)
      .maybeSingle();
    if (ticketTypeError) {
      console.error(ticketTypeError);
      return { kind: "error" };
    }
    ticketTypeName = ticketType?.name ?? null;
  }

  return classifyScan(ticket, ticketTypeName, eventId);
}

export async function checkInTicket(
  _prevState: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  // Individual reads, one per field — spreading FormData would also sweep in
  // React's own action-bookkeeping keys ($ACTION_*).
  const rawToken = formData.get("token");
  const rawEventId = formData.get("event_id");
  const rawBalanceDue = formData.get("balance_due");
  const rawPaymentCollected = formData.get("payment_collected");
  const rawCollectedAmount = formData.get("collected_amount");
  const rawCollectedCurrency = formData.get("collected_currency");

  const parsed = checkInSchema.safeParse({
    token: rawToken ?? "",
    event_id: rawEventId ?? "",
    balance_due: rawBalanceDue || undefined,
    payment_collected: rawPaymentCollected || undefined,
    collected_amount: rawCollectedAmount ?? undefined,
    collected_currency: rawCollectedCurrency || undefined,
  });

  if (!parsed.success) {
    // Echo the amount + currency the staff member entered so a rejected
    // balance-due submission does not blank what they typed (React resets an
    // uncontrolled form to its default once the action settles).
    return {
      errors: z.flattenError(parsed.error).fieldErrors,
      values: {
        collected_amount: String(rawCollectedAmount ?? ""),
        collected_currency: String(rawCollectedCurrency ?? ""),
      },
    };
  }

  const {
    token,
    event_id: eventId,
    balance_due: balanceDue,
    collected_amount: collectedAmount,
    collected_currency: collectedCurrency,
  } = parsed.data;

  const isPayAtDoor = balanceDue === "true";

  const supabase = createServiceClient();

  // One clock reading for both timestamps, so checked_in_at and
  // pay_at_door_collected_at cannot disagree. An UPDATE fires no column
  // default, so this must be written explicitly or the already-checked-in
  // screen has nothing to render (RESEARCH Pitfall 8).
  const now = new Date().toISOString();

  // A mutable object so the three collected columns can be added to THIS
  // patch on the balance-due path — the same conditional UPDATE, never a
  // second write. On the plain path the patch keeps exactly two keys, so a
  // ticket with no balance leaves all three collected columns NULL (D-18).
  const patch: Record<string, string> = {
    status: "checked_in",
    checked_in_at: now,
  };
  if (isPayAtDoor && collectedAmount !== undefined && collectedCurrency) {
    // The validated decimal string exactly as it arrived — never routed
    // through a JS number, which is the whole reason it stayed a string from
    // the input to the column.
    patch.pay_at_door_collected_amount = collectedAmount;
    patch.pay_at_door_collected_currency = collectedCurrency;
    patch.pay_at_door_collected_at = now;
  }

  // THE statement that makes this phase correct. `.eq("status", "issued")`
  // is the exactly-once guard and it must be the ONLY mechanism — no status
  // read that precedes and gates this write, no JS mutex, no explicit
  // transaction. A single conditional UPDATE takes a Postgres row lock and
  // is already atomic: the row transitions issued -> checked_in exactly once
  // regardless of how many callers arrive at the same instant.
  // `.eq("event_id", eventId)` scopes the write so a ticket for another
  // event can never be checked in from this event's scanner.
  // maybeSingle, NOT single: single throws on zero rows and destroys the
  // branch this whole design depends on.
  const { data: updated, error } = await supabase
    .from("tickets")
    .update(patch)
    .eq("qr_token", token)
    .eq("event_id", eventId)
    .eq("status", "issued")
    .select("checked_in_at, attendee_name")
    .maybeSingle();

  if (error) {
    console.error(error);
    return {
      formError:
        "Something went wrong checking this ticket in. Check your connection and try again.",
    };
  }

  // A non-null row means THIS caller performed the transition.
  if (updated) {
    return {
      ok: true,
      checkedInAt: updated.checked_in_at,
      attendeeName: updated.attendee_name,
    };
  }

  // Zero rows changed. This is the EXPECTED signal for a second scan, not a
  // failure. Disambiguate with a plain read (RESEARCH Pitfall 6).
  const { data: current, error: currentError } = await supabase
    .from("tickets")
    .select("status, checked_in_at, attendee_name")
    .eq("qr_token", token)
    .eq("event_id", eventId)
    .maybeSingle();

  if (currentError) {
    console.error(currentError);
    return {
      formError:
        "Something went wrong checking this ticket in. Check your connection and try again.",
    };
  }

  if (current?.status === "checked_in") {
    // A normal outcome — carry the ORIGINAL timestamp back, never log it as
    // an error, never report it as a second success.
    return {
      ok: false,
      alreadyCheckedIn: true,
      checkedInAt: current.checked_in_at,
      attendeeName: current.attendee_name,
    };
  }

  // Token/event no longer matches any row — defensive.
  return { ok: false, notFound: true };
}
