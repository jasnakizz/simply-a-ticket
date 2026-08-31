import Link from "next/link";
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import { formatEventDateRange } from "@/lib/date";
import { generateQrDataUrl } from "@/lib/qr";
import { buttonVariants } from "@/components/ui/button";

// Dynamic rendering so a bookmarked confirmation URL always re-reads live data
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
  // Note: the token column is read to regenerate the on-screen QR, and it
  // never leaves this server render — it is not put in the URL or the markup.
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
    .select("name, starts_at, ends_at, location")
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
      <div className="w-full max-w-[560px] px-4 py-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
            SENT
          </p>
          <h1 className="text-[40px] font-extrabold leading-[1.0] tracking-[-0.03em]">
            Your ticket is ready
          </h1>
        </div>
        <p className="text-[15px] leading-[1.55] break-words">
          A ticket has been emailed to {ticket.attendee_email}. Here&apos;s a
          copy of the QR code for your records:
        </p>

        <div className="flex items-center justify-center bg-[var(--color-surface)] p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- a base64
              data URL from qrcode; next/image optimization adds nothing here */}
          <img
            src={qrDataUrl}
            alt="Ticket QR code"
            width={320}
            height={320}
          />
        </div>

        {/* Row order per the UI-SPEC: event, date, location, ticket type,
            description, attendee. Both money figures are intentionally omitted
            — this screen is often seen by the attendee and those are internal
            bookkeeping (ORDER-04 / ORDER-05). Every value wraps via
            break-words so a long name or paragraph description is never
            clipped. */}
        <dl className="flex flex-col gap-3">
          <div className="flex flex-col">
            <dt className="text-[12px] text-muted-foreground">Event</dt>
            <dd className="text-[12px] font-extrabold break-words">
              {event.name}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-[12px] text-muted-foreground">Date</dt>
            <dd className="text-[12px] font-extrabold break-words">
              {formatEventDateRange(event.starts_at, event.ends_at)}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-[12px] text-muted-foreground">Location</dt>
            <dd className="text-[12px] font-extrabold break-words">
              {event.location}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-[12px] text-muted-foreground">Ticket type</dt>
            <dd className="text-[12px] font-extrabold break-words">
              {ticketType.name}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-[12px] text-muted-foreground">Details</dt>
            <dd className="text-[12px] font-extrabold break-words">
              {ticketType.description}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-[12px] text-muted-foreground">Attendee</dt>
            <dd className="text-[12px] font-extrabold break-words">
              {ticket.attendee_name}
            </dd>
          </div>
        </dl>

        <div className="border-t-2 border-border pt-3 pb-5 grid gap-2">
          <Link
            href={`/events/${eventId}/order`}
            className={buttonVariants({
              variant: "default",
              className: "min-h-[52px] justify-start text-left",
            })}
          >
            Add another
          </Link>
          <Link
            href={`/events/${eventId}`}
            className={buttonVariants({
              variant: "ghost",
              className: "min-h-[44px] justify-start text-left",
            })}
          >
            Back to event
          </Link>
        </div>
      </div>
    </div>
  );
}
