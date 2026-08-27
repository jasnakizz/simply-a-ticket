"use server";

// Mirrors createTicketType's Server Action shape (module-level zod schema,
// individually extracted formData.get(...) calls, safeParse, echoed values on
// failure, generic error copy on a DB failure) and adds the one genuinely new
// piece this phase introduces: an external side effect (the ticket email)
// that must succeed BEFORE the database row is written. Postgres and Resend
// share no transaction, so "email fails => no ticket persists" (ISSUE-04) can
// only be literally true if nothing is inserted until the send returns OK.
import { redirect } from "next/navigation";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { amountSchema } from "@/lib/amount";
import { formatEventDate } from "@/lib/date";
import { generateQrDataUrl, qrDataUrlToBase64 } from "@/lib/qr";
import { sendTicketEmail } from "@/lib/email";
import type { OrderState } from "@/app/actions/types";

// `event_id` and `ticket_type_id` both arrive from browser-controlled form
// fields (a hidden input and the radio group), so they are untrusted input
// like any other — z.uuid() rejects a malformed id here and the foreign keys
// on `tickets` are the database-level backstop.
//
// `currency` is a closed EUR/RSD enum with an RSD default (D-09, Claude's
// discretion — matches the local market in 02-CONTEXT.md): every order stores
// a currency, even a price-free one, and an order submitted with no currency
// field at all still validates because `.default("RSD")` fills it in. The two
// optional amount fields (plan 02-04) share `amountSchema` below.

// `amountSchema` (both optional money fields) is now shared from
// src/lib/amount.ts so the check-in Server Action can reuse the exact same
// anchored decimal rule and message. The value stays a *string* end to end and
// a blank field becomes `undefined` → SQL NULL, never `0` (D-09). See that
// module for the full rationale.

const orderSchema = z.object({
  event_id: z.uuid(),
  ticket_type_id: z.uuid("Select a ticket type."),
  attendee_name: z.string().trim().min(1, "Attendee name is required."),
  attendee_email: z.email("Enter a valid email address."),
  // Both optional; a blank field becomes `undefined` and is written as NULL.
  paid_amount: amountSchema,
  pay_at_door_amount: amountSchema,
  currency: z.enum(["EUR", "RSD"]).default("RSD"),
});

export async function createOrder(
  prevState: OrderState,
  formData: FormData
): Promise<OrderState> {
  // Individual reads, one per field — spreading the whole FormData into an
  // object would also sweep in React's own action-bookkeeping keys
  // ($ACTION_*).
  const rawEventId = formData.get("event_id");
  const rawTicketTypeId = formData.get("ticket_type_id");
  const rawAttendeeName = formData.get("attendee_name");
  const rawAttendeeEmail = formData.get("attendee_email");
  const rawPaidAmount = formData.get("paid_amount");
  const rawPayAtDoorAmount = formData.get("pay_at_door_amount");
  const rawCurrency = formData.get("currency");

  // Echoed back on every early return. React resets an uncontrolled form to
  // its defaultValue after an action settles, so without echoing the retry
  // would land on a blanked form (D-13). All six rendered fields — including
  // both amounts and the currency — so a rejected submission keeps everything
  // the staff member typed. `event_id` is deliberately not echoed: it comes
  // from the page's own hidden field.
  const values = {
    ticket_type_id: String(rawTicketTypeId ?? ""),
    attendee_name: String(rawAttendeeName ?? ""),
    attendee_email: String(rawAttendeeEmail ?? ""),
    paid_amount: String(rawPaidAmount ?? ""),
    pay_at_door_amount: String(rawPayAtDoorAmount ?? ""),
    currency: String(rawCurrency ?? ""),
  };

  const parsed = orderSchema.safeParse({
    event_id: rawEventId ?? "",
    ticket_type_id: rawTicketTypeId ?? "",
    attendee_name: rawAttendeeName ?? "",
    attendee_email: rawAttendeeEmail ?? "",
    paid_amount: rawPaidAmount ?? "",
    pay_at_door_amount: rawPayAtDoorAmount ?? "",
    currency: rawCurrency ?? undefined,
  });

  if (!parsed.success) {
    // flattenError().fieldErrors carries a message for every offending field
    // at once, not one at a time.
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const {
    event_id,
    ticket_type_id,
    attendee_name,
    attendee_email,
    paid_amount,
    pay_at_door_amount,
    currency,
  } = parsed.data;

  const supabase = createServiceClient();

  let confirmationPath: string | undefined;

  try {
    // BOTH filters. Without .eq("event_id", event_id) a tampered
    // ticket_type_id belonging to a different event is still a valid uuid
    // that passes its own foreign key — this is the only check that catches a
    // cross-event id, and it runs before any email is sent or row written.
    const { data: ticketType, error: ticketTypeError } = await supabase
      .from("ticket_types")
      .select("name, description")
      .eq("id", ticket_type_id)
      .eq("event_id", event_id)
      .maybeSingle();

    if (ticketTypeError) {
      console.error(ticketTypeError);
      return {
        formError:
          "Something went wrong placing this order. Check your connection and try again.",
        values,
      };
    }

    if (!ticketType) {
      // Reuse the field-level copy: only a tampered payload can reach this,
      // never the UI, so a distinct message would be a hint to whoever
      // tampered and copy no real staff member ever sees.
      return { errors: { ticket_type_id: ["Select a ticket type."] }, values };
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("name, event_date, location")
      .eq("id", event_id)
      .maybeSingle();

    if (eventError || !event) {
      console.error(eventError ?? new Error(`order: event ${event_id} not found`));
      return {
        formError:
          "Something went wrong placing this order. Check your connection and try again.",
        values,
      };
    }

    // ISSUE-01 / PROMISES.md non-negotiable: a cryptographic random token,
    // generated here in server code before any row exists. Never a
    // non-cryptographic PRNG, never the ticket id (which does not exist yet
    // at this point), never derived from it. crypto.randomUUID() is 122 bits
    // of CSPRNG output.
    const qrToken = crypto.randomUUID();

    // One generation call. The QR encodes the token string and nothing else.
    const qrDataUrl = await generateQrDataUrl(qrToken);
    const qrBase64 = qrDataUrlToBase64(qrDataUrl);

    // Email BEFORE the insert. formatEventDate here so there is exactly one
    // date convention in the app — the email module never formats a date.
    const { error: emailError } = await sendTicketEmail({
      to: attendee_email,
      attendeeName: attendee_name,
      eventName: event.name,
      eventDate: formatEventDate(event.event_date),
      eventLocation: event.location,
      ticketTypeName: ticketType.name,
      ticketTypeDescription: ticketType.description,
      qrBase64,
    });

    if (emailError) {
      // Nothing has touched the database yet, so ISSUE-04's "no ticket record
      // persists" is satisfied by the ordering itself — there is nothing to
      // roll back.
      console.error(emailError);
      return {
        formError:
          "Couldn't send the ticket email. Check your connection and try again.",
        values,
      };
    }

    // Only now insert. Parsed/trimmed values, never the raw ones. Both amount
    // columns are written from the strings amountSchema produced — `null` when
    // the field was left blank (never coerced to 0), and never routed through
    // a JS number so the two-decimal value Postgres stores is exactly what was
    // typed.
    const { data: ticket, error: insertError } = await supabase
      .from("tickets")
      .insert({
        event_id,
        ticket_type_id,
        attendee_name,
        attendee_email,
        qr_token: qrToken,
        paid_amount: paid_amount ?? null,
        pay_at_door_amount: pay_at_door_amount ?? null,
        currency,
      })
      .select("id")
      .single();

    if (insertError || !ticket) {
      // Distinct, greppable marker: the attendee already holds a real emailed
      // ticket for a token that is not in the DB. The token and email are
      // logged so the row can be reconstructed from a Vercel log. The copy
      // below is deliberately different from the email-failure copy above —
      // a staff member who retries after THIS one emails a second ticket.
      console.error("CRITICAL ticket-emailed-not-persisted", {
        qrToken,
        attendee_email,
        insertError,
      });
      return {
        formError:
          "The ticket email was sent, but saving the order failed. Contact support before retrying.",
        values,
      };
    }

    confirmationPath = `/events/${event_id}/order/confirmation/${ticket.id}`;
  } catch (err) {
    console.error(err);
    return {
      formError:
        "Something went wrong placing this order. Check your connection and try again.",
      values,
    };
  }

  // Unreachable in practice: the try block either returns or sets this. The
  // guard is here so `redirect` receives a plain string.
  if (!confirmationPath) {
    throw new Error("createOrder: reached redirect with no confirmation path");
  }

  // redirect() signals navigation by throwing a framework-recognised control
  // -flow error, so it MUST be called outside the try/catch above — a
  // surrounding catch would swallow it and staff would see a generic failure
  // on a form whose order actually succeeded. The ticket id in the URL is
  // safe: the id is not the secret, the qr_token is, and the token never
  // appears in a URL.
  redirect(confirmationPath);
}
