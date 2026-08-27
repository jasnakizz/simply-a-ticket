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
import { classifyScan, type ScanResult } from "@/lib/scan-result";
import type { CheckInState } from "@/app/actions/types";

// A blank or whitespace-only decode is an ordinary "not a ticket" outcome —
// it must never reach the database as a query on an empty value.
const tokenSchema = z.string().trim().min(1);

const checkInSchema = z.object({
  token: z.string().trim().min(1),
  event_id: z.uuid(),
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

  const parsed = checkInSchema.safeParse({
    token: rawToken ?? "",
    event_id: rawEventId ?? "",
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { token, event_id: eventId } = parsed.data;

  const supabase = createServiceClient();

  // An UPDATE fires no column default, so checked_in_at must be written
  // explicitly here or the already-checked-in screen has nothing to render
  // (RESEARCH Pitfall 8).
  const patch = {
    status: "checked_in" as const,
    checked_in_at: new Date().toISOString(),
  };

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
