import Link from "next/link";
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import { formatEventDate } from "@/lib/date";
import { buttonVariants } from "@/components/ui/button";
import { AddTicketTypeForm } from "./add-ticket-type-form";

// Same reasoning as /events: staff need the current data, not a build-time
// snapshot frozen at whatever existed when Vercel built the app.
export const dynamic = "force-dynamic";

// In Next.js 16, `params` is a Promise, not a plain object — reading it
// synchronously (the shape every older Next.js tutorial shows) is a build
// error here. Typing it as a Promise up front makes the compiler catch a
// missing `await` for us instead of finding out at runtime.
export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const supabase = createServiceClient();

  // maybeSingle() returns null on no match instead of throwing, which lets
  // us treat "no such row" and "malformed id" (Postgres rejects a non-uuid
  // string with a type error, surfaced here as `error`) the same way: both
  // are an honest 404, not a stack trace.
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, description, event_date, location")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    notFound();
  }

  // The `eq` filter here is what keeps another event's ticket types off
  // this page — this is the one query in the app that scopes ticket_types
  // by event_id, and every other read/write funnels through it.
  const { data: ticketTypes, error: ticketTypesError } = await supabase
    .from("ticket_types")
    .select("id, name, description")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  // Thrown here, caught by src/app/events/error.tsx — a read failure on
  // this segment renders the contracted error copy instead of an unhandled
  // exception or a blank page.
  if (ticketTypesError) {
    throw ticketTypesError;
  }

  return (
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-md px-6 py-6 flex flex-col gap-4">
        <Link href="/events" className={buttonVariants({ variant: "ghost" })}>
          View events
        </Link>

        <h1 className="text-2xl font-semibold leading-[1.2] break-words">
          {event.name}
        </h1>
        <p className="text-base font-normal leading-[1.5] break-words">
          {event.description}
        </p>
        <p className="text-base font-normal leading-[1.5] break-words">
          {event.location}
        </p>
        {/* formatEventDate pins the locale and UTC so the server render and
            the browser hydration agree, and the calendar day never shifts
            based on either machine's local timezone. */}
        <p className="text-base font-normal leading-[1.5]">
          {formatEventDate(event.event_date)}
        </p>

        {/* The main thing you do with an event once it is set up — sits above
            the ticket-types list, not buried under the add form at the
            bottom. Same Link + primary buttonVariants combo the events list
            uses for "Add event". */}
        <Link
          href={`/events/${eventId}/order`}
          className={buttonVariants({ variant: "default" })}
        >
          Place an order
        </Link>

        {/* Secondary action next to "Place an order" — outline variant so it
            reads as secondary against the accent primary (D-01). */}
        <Link
          href={`/events/${eventId}/scan`}
          className={buttonVariants({ variant: "outline" })}
        >
          Scan tickets
        </Link>

        <div className="mt-8 flex flex-col gap-4">
          {ticketTypes && ticketTypes.length === 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold leading-[1.2]">
                No ticket types yet
              </h2>
              <p className="text-base font-normal leading-[1.5] text-muted-foreground">
                Add a ticket type below to start selling this event.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {ticketTypes?.map((ticketType, index) => (
                <li
                  key={ticketType.id}
                  className={
                    index === 0
                      ? "flex flex-col gap-1 py-3"
                      : "flex flex-col gap-1 border-t border-border py-3"
                  }
                >
                  <p className="text-sm font-semibold leading-[1.4] break-words">
                    {ticketType.name}
                  </p>
                  <p className="text-base font-normal leading-[1.5] break-words">
                    {ticketType.description}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-12 flex flex-col gap-4">
          <h2 className="text-2xl font-semibold leading-[1.2]">
            Add ticket type
          </h2>
          <AddTicketTypeForm eventId={eventId} />
        </div>
      </div>
    </div>
  );
}
