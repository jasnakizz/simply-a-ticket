import "server-only";

// This module holds the Resend credential, so an accidental import from a
// "use client" file must be a build error rather than a leaked key.
// `import "server-only"` (kept as the first statement) is what enforces that.
import { Resend } from "resend";

// Mirrors createServiceClient() in src/lib/supabase/server.ts: read the env
// vars inside a factory and throw a named error when one is missing, rather
// than doing `new Resend(...)` at module scope where a missing variable turns
// into a build-time crash somewhere unrelated.
function createResendClient(): { resend: Resend; from: string } {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY environment variable");
  }
  if (!from) {
    throw new Error("Missing RESEND_FROM environment variable");
  }

  return { resend: new Resend(apiKey), from };
}

// Escape `&` FIRST (so the `&` in the entities we introduce below is not
// re-escaped), then the markup-significant characters. This is not
// decoration: every value interpolated into the HTML body is staff-typed or
// came from a database row a staff member typed earlier, and the body is
// assembled as an HTML string. Without this, an event named `<b>` would put
// live markup into a stranger's inbox. Escape first, interpolate second.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Exactly the fields D-12 allows in the ticket email — and no wider. The two
// staff-only money fields are deliberately absent from this type, so they
// cannot reach the template even by accident (ORDER-04 / ORDER-05).
export type SendTicketEmailParams = {
  to: string;
  attendeeName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  ticketTypeName: string;
  ticketTypeDescription: string;
  qrBase64: string;
};

// The caller only needs to know whether the send succeeded. Resend returns
// its own `{ data, error }`; a DNS/network failure reaching the API can throw
// instead of resolving, so that path is caught and surfaced as `error` too.
export async function sendTicketEmail(
  params: SendTicketEmailParams
): Promise<{ error: unknown | null }> {
  const {
    to,
    attendeeName,
    eventName,
    eventDate,
    eventLocation,
    ticketTypeName,
    ticketTypeDescription,
    qrBase64,
  } = params;

  const name = escapeHtml(attendeeName);
  const evName = escapeHtml(eventName);
  const evDate = escapeHtml(eventDate);
  const evLocation = escapeHtml(eventLocation);
  const ttName = escapeHtml(ticketTypeName);
  const ttDescription = escapeHtml(ticketTypeDescription);

  // The QR is referenced by `cid:ticket-qr`, paired with the attachment's
  // `contentId` below. A data URI in the src is stripped by many mail
  // clients, which is exactly what ISSUE-03 rules out.
  const html = `<div>
  <p>Hi ${name},</p>
  <p>Here is your ticket for <strong>${evName}</strong>.</p>
  <table cellpadding="4">
    <tr><td><strong>Event</strong></td><td>${evName}</td></tr>
    <tr><td><strong>Date</strong></td><td>${evDate}</td></tr>
    <tr><td><strong>Location</strong></td><td>${evLocation}</td></tr>
    <tr><td><strong>Ticket type</strong></td><td>${ttName}</td></tr>
    <tr><td><strong>Details</strong></td><td>${ttDescription}</td></tr>
  </table>
  <p>Show this QR code at the door:</p>
  <img src="cid:ticket-qr" alt="Ticket QR code" width="320" height="320" />
</div>`;

  const { resend, from } = createResendClient();

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      // Raw, unescaped event name: a subject line is plain text, and escaping
      // it would show entity codes in the attendee's inbox list.
      subject: `Your ticket for ${eventName}`,
      html,
      attachments: [
        {
          content: qrBase64,
          filename: "ticket-qr.png",
          contentId: "ticket-qr",
        },
      ],
    });

    return { error: error ?? null };
  } catch (err) {
    return { error: err };
  }
}
