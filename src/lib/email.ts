import "server-only";

// This module holds the Resend credential, so an accidental import from a
// "use client" file must be a build error rather than a leaked key.
// `import "server-only"` (kept as the first statement) is what enforces that.
import { Resend } from "resend";

import { formatMoney } from "@/lib/amount";

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

// PAYMENT_NOTE: the fixed line under the pay-at-the-door figure (D-11). Held
// raw here and escaped at the point of use inside buildTicketEmailHtml, not at
// declaration, so this module keeps a single escaping convention.
const PAYMENT_NOTE = "Cash only, please.";

// Exactly the fields the ticket email is permitted to carry — and no wider.
// Per the D-12 partial reversal, the still-owed pay-at-the-door figure
// (payAtDoorAmount) and its currency are now allowed to reach the template.
// The already-paid figure (paid_amount / paidAmount) remains forbidden and is
// deliberately absent from this type, so it cannot reach a stranger's inbox
// even by accident (EMAIL-03). This type is the mechanical guard that keeps
// the D-12 reversal partial.
export type SendTicketEmailParams = {
  to: string;
  attendeeName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  ticketTypeName: string;
  ticketTypeDescription: string;
  qrBase64: string;
  payAtDoorAmount?: string;
  currency?: "EUR" | "RSD" | null;
};

// buildTicketEmailHtml — the pure HTML assembler, lifted out of sendTicketEmail
// so a plain node test can call it and assert on the real body (SC1/SC2). This
// is the JS equivalent of pulling a private string-building block into a
// package-visible pure method: string in, string out, no I/O, no env read, no
// Resend client. The send path is unchanged — the function is just addressable.
export function buildTicketEmailHtml(params: SendTicketEmailParams): string {
  const {
    attendeeName,
    eventName,
    eventDate,
    eventLocation,
    ticketTypeName,
    ticketTypeDescription,
    payAtDoorAmount,
    currency,
  } = params;

  const name = escapeHtml(attendeeName);
  const evName = escapeHtml(eventName);
  const evDate = escapeHtml(eventDate);
  const evLocation = escapeHtml(eventLocation);
  const ttName = escapeHtml(ticketTypeName);
  const ttDescription = escapeHtml(ticketTypeDescription);

  // The pay-at-the-door gate — the same shape as classifyScan's balance check
  // in src/lib/scan-result.ts, with one added conjunct because a band needs a
  // currency to render. This single Number() conversion is comparison-only and
  // never touches the rendered figure: formatMoney below is fed the original
  // string, so a two-decimal value ("2000.00") stays two decimals in a
  // stranger's inbox.
  const hasBalance =
    payAtDoorAmount != null &&
    currency != null &&
    Number(payAtDoorAmount) > 0;

  // Computed only when the gate is true; the empty string otherwise.
  const amountDue = hasBalance
    ? escapeHtml(formatMoney(payAtDoorAmount, currency))
    : "";

  // The pay-at-the-door row: markup verbatim from
  // design_handoff_ticket_email/ticket-email-a-stub.html lines 86-92, with the
  // amount token replaced by the computed figure and the note token by the
  // escaped PAYMENT_NOTE. The whole row is present or entirely absent — never a
  // zero band, never an empty row.
  const bandRow = hasBalance
    ? `
    <tr>
      <td class="px" align="left" bgcolor="#ec3013" style="background-color:#ec3013; padding:30px 40px; border-top:2px solid #201e1d;">
        <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:14px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.4px; text-transform:uppercase; color:#ffffff;">Please bring to the door</p>
        <p style="margin:0 0 10px 0; font-family:Arial,Helvetica,sans-serif; font-size:34px; line-height:36px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:-1px; color:#ffffff;">${amountDue}</p>
        <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#ffffff;">${escapeHtml(PAYMENT_NOTE)}</p>
      </td>
    </tr>`
    : "";

  // Body is still the phase-02 one-line template — task 3 of this plan swaps it
  // for the six-section Modernist document. Only the band is new in this task.
  // The QR is referenced by `cid:ticket-qr`, paired with the attachment's
  // `contentId` in sendTicketEmail. A data URI in the src is stripped by many
  // mail clients, which is exactly what ISSUE-03 rules out.
  return `<div>
  <p>Hi ${name},</p>
  <p>Here is your ticket for <strong>${evName}</strong>.</p>
  <table cellpadding="4">
    <tr><td><strong>Event</strong></td><td>${evName}</td></tr>
    <tr><td><strong>Date</strong></td><td>${evDate}</td></tr>
    <tr><td><strong>Location</strong></td><td>${evLocation}</td></tr>
    <tr><td><strong>Ticket type</strong></td><td>${ttName}</td></tr>
    <tr><td><strong>Details</strong></td><td>${ttDescription}</td></tr>${bandRow}
  </table>
  <p>Show this QR code at the door:</p>
  <img src="cid:ticket-qr" alt="Ticket QR code" width="320" height="320" />
</div>`;
}

// The caller only needs to know whether the send succeeded. Resend returns
// its own `{ data, error }`; a DNS/network failure reaching the API can throw
// instead of resolving, so that path is caught and surfaced as `error` too.
export async function sendTicketEmail(
  params: SendTicketEmailParams
): Promise<{ error: unknown | null }> {
  const { to, eventName, qrBase64 } = params;

  const html = buildTicketEmailHtml(params);

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
