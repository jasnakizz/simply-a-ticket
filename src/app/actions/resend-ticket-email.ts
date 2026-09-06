"use server";

// The resend path for a not-yet-checked-in attendee's ticket email
// (SEARCH-03). A sibling — never a fork — of createOrder's email step in
// orders.ts: it re-reads the ticket, event and ticket type server-side,
// regenerates the QR image FROM THE TICKET'S OWN STORED TOKEN (it mints
// nothing — the token minting in createOrder exists only because a brand-new
// ticket has no row yet), and calls the one existing send path. No second copy
// of the email-building logic exists anywhere in src/.
//
// This is a Server Action (POST body) rather than a route handler on purpose:
// the ticket identifier and the stored token must never reach a URL, a query
// string, a redirect/revalidate argument or a server log line. The body
// performs reads plus one outbound email and NO row mutation and NO row
// creation; it revalidates nothing and navigates nowhere — the detail page
// derives nothing from a send, so the island reports the outcome inline and
// the page is left exactly as it was.
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { formatEventDateRange } from "@/lib/date";
import { generateQrDataUrl, qrDataUrlToBase64 } from "@/lib/qr";
import { sendTicketEmail } from "@/lib/email";
import type { ResendTicketEmailState } from "@/app/actions/types";

// Four fixed staff-facing sentences — no database detail in any of them. Every
// failure path returns one of these; the real error, if any, goes to
// console.error only. The send-error sentence is a byte-identical copy of the
// string createOrder already returns for a failed send (orders.ts) — copied,
// not reinvented, so the resend path introduces no new failure wording. The
// not-found sentence is a byte-identical copy of ticket-note.ts's
// SAVE_TICKET_NOTE_NOT_FOUND for the same outcome.
const RESEND_TICKET_EMAIL_SEND_ERROR =
  "Couldn't send the ticket email. Check your connection and try again.";
const RESEND_TICKET_EMAIL_NOT_FOUND =
  "Couldn't find this ticket. Reload the page and try again.";
const RESEND_TICKET_EMAIL_READ_ERROR =
  "Something went wrong reading this ticket. Check your connection and try again.";
const RESEND_TICKET_EMAIL_INCOMPLETE =
  "This ticket is missing details needed to rebuild its email. Check it in the database.";

// Both ids arrive from browser-controlled hidden form fields, so both are
// untrusted input — z.uuid() rejects a malformed id before any read runs.
const resendTicketEmailSchema = z.object({
  ticket_id: z.uuid(),
  event_id: z.uuid(),
});

export async function resendTicketEmail(
  _prevState: ResendTicketEmailState,
  formData: FormData,
): Promise<ResendTicketEmailState> {
  // Individual reads, one per field — spreading FormData would also sweep in
  // React's own action-bookkeeping keys ($ACTION_*).
  const rawTicketId = formData.get("ticket_id");
  const rawEventId = formData.get("event_id");

  const parsed = resendTicketEmailSchema.safeParse({
    ticket_id: rawTicketId ?? "",
    event_id: rawEventId ?? "",
  });

  if (!parsed.success) {
    // A malformed id can only reach here from a tampered payload, never the UI
    // — the not-found outcome is returned before any read.
    return {
      ok: false,
      notFound: true,
      formError: RESEND_TICKET_EMAIL_NOT_FOUND,
    };
  }

  const { ticket_id: ticketId, event_id: eventId } = parsed.data;

  const supabase = createServiceClient();

  // 1. The ticket read — scoped by BOTH .eq("id", ticketId) and
  //    .eq("event_id", eventId), mirroring createOrder's cross-event guard
  //    (T-24-01): a well-formed ticket uuid belonging to another event
  //    resolves to no row and returns the not-found outcome without sending
  //    anything. The select list deliberately OMITS the pre-paid money column
  //    entirely — defence in depth behind the EMAIL-03 type ban.
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select(
      "attendee_name, attendee_email, ticket_type_id, qr_token, pay_at_door_amount::text, currency",
    )
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (ticketError) {
    console.error(ticketError);
    return { formError: RESEND_TICKET_EMAIL_READ_ERROR };
  }
  if (!ticket) {
    return {
      ok: false,
      notFound: true,
      formError: RESEND_TICKET_EMAIL_NOT_FOUND,
    };
  }

  // 2. The event read — needed for the masthead, date band and location.
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("name, starts_at, ends_at, location")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    console.error(eventError);
    return { formError: RESEND_TICKET_EMAIL_READ_ERROR };
  }
  if (!event) {
    return { formError: RESEND_TICKET_EMAIL_INCOMPLETE };
  }

  // 3. The ticket-type read — scoped by BOTH .eq("id", ticket.ticket_type_id)
  //    and .eq("event_id", eventId), the same cross-event guard createOrder
  //    uses (T-24-02), so a cross-event type name can never be rendered into
  //    an outbound email.
  const { data: ticketType, error: ticketTypeError } = await supabase
    .from("ticket_types")
    .select("name, description")
    .eq("id", ticket.ticket_type_id)
    .eq("event_id", eventId)
    .maybeSingle();

  if (ticketTypeError) {
    console.error(ticketTypeError);
    return { formError: RESEND_TICKET_EMAIL_READ_ERROR };
  }
  if (!ticketType) {
    return { formError: RESEND_TICKET_EMAIL_INCOMPLETE };
  }

  // The stored token is the ticket's own — this action creates no token of any
  // kind. A missing or non-string stored value means the row cannot reproduce
  // its already-issued QR, so there is nothing to resend.
  const storedToken = ticket.qr_token;
  if (typeof storedToken !== "string" || storedToken === "") {
    return { formError: RESEND_TICKET_EMAIL_INCOMPLETE };
  }

  // Regenerate the QR image straight from the ticket row's own stored token
  // column — same generation path createOrder uses, fed the existing value.
  const qrDataUrl = await generateQrDataUrl(ticket.qr_token);
  const qrBase64 = qrDataUrlToBase64(qrDataUrl);

  // Call the one existing send path once. formatEventDateRange here so there is
  // exactly one date convention in the app — the email module never formats a
  // date. payAtDoorAmount is the ticket's STORED pay_at_door_amount + currency
  // (D-14), coerced `?? undefined` to fit the optional string param; the
  // pre-paid figure is never selected above and never passed (EMAIL-03).
  const { error: emailError } = await sendTicketEmail({
    to: ticket.attendee_email,
    attendeeName: ticket.attendee_name,
    eventName: event.name,
    eventDate: formatEventDateRange(event.starts_at, event.ends_at),
    eventLocation: event.location,
    ticketTypeName: ticketType.name,
    ticketTypeDescription: ticketType.description,
    qrBase64,
    payAtDoorAmount: ticket.pay_at_door_amount ?? undefined,
    currency: ticket.currency,
  });

  if (emailError) {
    console.error(emailError);
    return { formError: RESEND_TICKET_EMAIL_SEND_ERROR };
  }

  return { ok: true, sentTo: ticket.attendee_email };
}
