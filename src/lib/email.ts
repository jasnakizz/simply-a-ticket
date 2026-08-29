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
// package-visible pure method: string in, string out, no I/O, no Resend client.
// It reads process.env.ORGANISER_NAME (D-01) but never throws on a missing
// value — the send happens before the ticket row is inserted, so a throw here
// would block every order (D-02). The send path is unchanged; the function is
// just addressable.
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

  // D-14: the greeting headline first name is the first whitespace-delimited
  // token of the trimmed attendee name, or the literal "there" when the name is
  // empty or whitespace-only. Escaped like every other interpolation.
  const firstName = escapeHtml(attendeeName.trim().split(/\s+/)[0] || "there");

  // D-01/D-02: the masthead + footer organiser name. Read the variable lazily
  // (the createResendClient pattern) but DO NOT copy its throw — fall back to
  // the event name so a missing variable degrades one line of the masthead
  // rather than failing every send. One computed value, escaped once,
  // interpolated in both the masthead and the footer.
  const organiserName = escapeHtml(process.env.ORGANISER_NAME || eventName);

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

  // The pay-at-the-door row: structure from
  // design_handoff_ticket_email/ticket-email-a-stub.html lines 86-92, with the
  // amount token replaced by the computed figure and the note token by the
  // escaped PAYMENT_NOTE. Phase 5 post-checkpoint amendment: the amount is 18px/
  // 24px (matching the ticket-type value) rather than the handoff's 34px display,
  // and the band padding is 20px (was 30px), so the red field fits its text
  // instead of dominating the message. The whole row is present or entirely
  // absent — never a zero band, never an empty row (D-12). Its own top rule
  // closes the ticket stub; the CTA slot below also carries a top rule, so when
  // this row is absent the stub is still closed by exactly one 2px ink rule.
  const bandRow = hasBalance
    ? `
  <tr>
    <td class="px" align="left" bgcolor="#ec3013" style="background-color:#ec3013; padding:20px 40px; border-top:2px solid #201e1d;">
      <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:14px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.4px; text-transform:uppercase; color:#ffffff;">Please bring to the door</p>
      <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:18px; line-height:24px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:-0.2px; color:#ffffff;">${amountDue}</p>
      <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#ffffff;">${escapeHtml(PAYMENT_NOTE)}</p>
    </td>
  </tr>`
    : "";

  // The six-section Modernist document, ported section by section from
  // design_handoff_ticket_email/ticket-email-a-stub.html. Every hex, pixel and
  // fixed string is transcribed verbatim from the handoff — the values are the
  // contract, not suggestions. Every interpolated value goes through escapeHtml;
  // the subject line in sendTicketEmail is the one deliberate raw exception.
  // Mail clients drop external stylesheets, web fonts and <link>, so the single
  // <style> block below carries only the max-width:620px media query and the
  // design is judged in the Arial stack. No layout is carried by that query —
  // Outlook desktop ignores it, so the 600px fixed layout stands on its own.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Your ticket for ${evName}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
    .stack { display: block !important; width: 100% !important; padding: 0 0 20px 0 !important; }
    .h1 { font-size: 26px !important; line-height: 30px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#e6e4e3; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

<span style="display:none; font-size:1px; color:#e6e4e3; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Your ticket is ready — show the QR code at the door. ${ttName} for ${evName}.</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e6e4e3;">
<tr>
<td align="center" style="padding:32px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px; max-width:600px; background-color:#f3f2f2; border-top:6px solid #ec3013;">

  <!-- Section 1 — Masthead (D-01/D-02) -->
  <tr>
    <td class="px" style="padding:26px 40px 22px 40px; border-bottom:2px solid #201e1d;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="left" style="font-family:Arial,Helvetica,sans-serif; font-size:18px; line-height:20px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:-0.3px; color:#201e1d;">${organiserName}</td>
          <td align="right" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:20px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.4px; text-transform:uppercase; color:#ec3013;">Ticket confirmed</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Section 2 — Greeting (D-14) -->
  <tr>
    <td class="px" style="padding:40px 40px 32px 40px; border-bottom:2px solid #201e1d;">
      <p style="margin:0 0 18px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:14px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.4px; text-transform:uppercase; color:#6d6664;">${evDate} &mdash; ${evLocation}</p>
      <h1 class="h1" style="margin:0 0 18px 0; font-family:Arial,Helvetica,sans-serif; font-size:30px; line-height:34px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:-1px; color:#201e1d;">Hello, ${firstName}.</h1>
      <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:17px; line-height:27px; mso-line-height-rule:exactly; color:#3d3937;">Your ticket for <strong style="color:#201e1d;">${evName}</strong> is ready. The QR code below is your ticket &mdash; show it on your phone at the door and we&rsquo;ll scan you straight in. No printing needed.</p>
    </td>
  </tr>

  <!-- Section 3 — Ticket stub: QR + details (D-06 drops the id line; D-07 alt; D-16 cid) -->
  <tr>
    <td class="px" style="padding:0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td class="stack" align="left" valign="top" width="220" style="width:220px; padding:32px 24px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="200" style="width:200px;">
              <tr>
                <td align="center" valign="middle" width="200" height="200" bgcolor="#ffffff" style="width:200px; height:200px; background-color:#ffffff; border:2px solid #201e1d; padding:8px;">
                  <!-- D-16: this deliberately keeps the cid:ticket-qr attachment reference
                       (paired with contentId "ticket-qr" in sendTicketEmail) rather than
                       the handoff's hosted image link, so no token-derived value is ever
                       placed in a link. -->
                  <img src="cid:ticket-qr" width="184" height="184" alt="QR ticket code for ${name} — ${ttName}, ${evName}" style="display:block; width:184px; height:184px; border:0; outline:none; text-decoration:none;">
                </td>
              </tr>
            </table>
          </td>
          <td class="stack" align="left" valign="top" style="padding:32px 0;">
            <p style="margin:0 0 6px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:14px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:#6d6664;">Ticket holder</p>
            <p style="margin:0 0 22px 0; font-family:Arial,Helvetica,sans-serif; font-size:18px; line-height:24px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:-0.2px; color:#201e1d;">${name}</p>

            <p style="margin:0 0 6px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:14px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:#6d6664;">Ticket type</p>
            <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:18px; line-height:24px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:-0.2px; color:#ec3013;">${ttName}</p>
            <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#3d3937;">${ttDescription}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
${bandRow}
  <!-- Section 5 — CTA slot (D-05): button + link removed, 2px top+bottom rules kept -->
  <tr>
    <td class="px" style="padding:32px 40px; border-top:2px solid #201e1d; border-bottom:2px solid #201e1d;">
      <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#3d3937;">Keep this email &mdash; the QR code above is your ticket. No printout or app needed.</p>
    </td>
  </tr>

  <!-- Section 6 — Footer (D-03/D-04): no-reply notice + organiser name only.
       Phase 5 post-checkpoint amendment — the earlier line promised a monitored
       reply inbox that does not exist; a v3 idea (contact_email/phone on the
       events row) is recorded in 05-CONTEXT.md Deferred Ideas. -->
  <tr>
    <td class="px" style="padding:26px 40px 34px 40px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:20px; mso-line-height-rule:exactly; color:#6d6664;">
      <p style="margin:0 0 10px 0;">This mailbox is not monitored &mdash; please do not reply to this email.</p>
      <p style="margin:0;">${organiserName}</p>
    </td>
  </tr>

</table>

</td>
</tr>
</table>

</body>
</html>`;
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
