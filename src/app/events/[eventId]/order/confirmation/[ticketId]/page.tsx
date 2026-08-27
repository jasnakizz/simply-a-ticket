import Link from "next/link";
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import { formatEventDate } from "@/lib/date";
import { generateQrDataUrl } from "@/lib/qr";
import { buttonVariants } from "@/components/ui/button";

// force-dynamic so a bookmarked confirmation URL always re-reads live data
// rather than serving a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ eventId: string; ticketId: string }>;
}) {
  const { eventId, ticketId } = await params;

  const supabase = createServiceClient();

  // Scoped by BOTH id and event_id — the same defence createOrder uses. A
  // ticket id from another event must not render under this event's URL.
  // Note: qr_token is read to regenerate the on-screen QR, and it never
  // leaves this server render — it is not put in the URL or the markup.
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select(
      "id, event_id, ticket_type_id, attendee_name, attendee_email, qr_token"
    )
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (ticketError || !ticket) {
    notFound();
  }

  // Separate flat queries by id — no embedded-resource select exists anywhere
  // in this repo to check the syntax against, and flat reads are the house
  // style.
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("name, event_date, location")
    .eq("id", ticket.event_id)
    .maybeSingle();

  const { data: ticketType, error: ticketTypeError } = await supabase
    .from("ticket_types")
    .select("name, description")
    .eq("id", ticket.ticket_type_id)
    .maybeSingle();

  if (eventError || !event || ticketTypeError || !ticketType) {
    notFound();
  }

  // Regenerated from the stored token on this request — the QR image is never
  // passed through the redirect, keeping the token and the attendee's details
  // out of the URL entirely.
  const qrDataUrl = await generateQrDataUrl(ticket.qr_token);

  return (
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-md px-6 py-6 flex flex-col gap-4">
        <h1 className="text-2xl font-semibold leading-[1.2]">
          Your ticket is ready
        </h1>
        <p className="text-base font-normal leading-[1.5] break-words">
          A ticket has been emailed to {ticket.attendee_email}. Here&apos;s a
          copy of the QR code for your records:
        </p>

        <div className="flex items-center justify-center rounded-md bg-muted p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- a base64
              data URL from qrcode; next/image optimization adds nothing here */}
          <img
            src={qrDataUrl}
            alt="Ticket QR code"
            width={320}
            height={320}
          />
        </div>

        {/* xl gap (mt-4 on top of the parent's gap-4 = 32px) between the QR
            and these rows, per the UI-SPEC spacing map. Row order follows the
            UI-SPEC: event, date, location, ticket type, description, attendee.
            The two money figures the staff member just entered are
            deliberately absent here — this screen is often seen by the
            attendee and those figures are staff-only (ORDER-04 / ORDER-05),
            the same non-disclosure rule the ticket email follows. Every value
            carries break-words so a long name or a paragraph-length
            description wraps in full instead of being clipped. */}
        <dl className="mt-4 flex flex-col gap-2">
          <div className="flex flex-col">
            <dt className="text-sm font-semibold leading-[1.4]">Event</dt>
            <dd className="text-base font-normal leading-[1.5] break-words">
              {event.name}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-sm font-semibold leading-[1.4]">Date</dt>
            <dd className="text-base font-normal leading-[1.5] break-words">
              {formatEventDate(event.event_date)}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-sm font-semibold leading-[1.4]">Location</dt>
            <dd className="text-base font-normal leading-[1.5] break-words">
              {event.location}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-sm font-semibold leading-[1.4]">Ticket type</dt>
            <dd className="text-base font-normal leading-[1.5] break-words">
              {ticketType.name}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-sm font-semibold leading-[1.4]">Details</dt>
            <dd className="text-base font-normal leading-[1.5] break-words">
              {ticketType.description}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-sm font-semibold leading-[1.4]">Attendee</dt>
            <dd className="text-base font-normal leading-[1.5] break-words">
              {ticket.attendee_name}
            </dd>
          </div>
        </dl>

        <Link
          href={`/events/${eventId}`}
          className={buttonVariants({ variant: "ghost" })}
        >
          Back to event
        </Link>
      </div>
    </div>
  );
}
