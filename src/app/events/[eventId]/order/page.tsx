import Link from "next/link";
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import { formatEventDate } from "@/lib/date";
import { buttonVariants } from "@/components/ui/button";
import { OrderForm } from "./order-form";

// Same reasoning as the event detail page: staff need the current
// ticket-type list on every request, not a build-time snapshot.
export const dynamic = "force-dynamic";

// `params` is a Promise in Next.js 16 — typing it as one up front makes the
// compiler catch a missing `await` instead of a runtime error.
export default async function OrderPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const supabase = createServiceClient();

  // maybeSingle(): "no such row" and "malformed id" both surface the same
  // way — an honest 404, not a stack trace.
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, event_date, location")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    notFound();
  }

  const { data: ticketTypes, error: ticketTypesError } = await supabase
    .from("ticket_types")
    .select("id, name, description")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  // Thrown here, caught by src/app/events/error.tsx — no new error boundary
  // for this route.
  if (ticketTypesError) {
    throw ticketTypesError;
  }

  const hasTicketTypes = ticketTypes && ticketTypes.length > 0;

  return (
    <div className="flex flex-col flex-1 items-center">
      {/* max-w-md px-6 matches the event detail page so the two line up;
          pt-16 is the UI-SPEC's page-level top spacing (3xl). */}
      <div className="w-full max-w-md px-6 pt-16 pb-6 flex flex-col gap-6">
        <Link
          href={`/events/${eventId}`}
          className={buttonVariants({ variant: "ghost" })}
        >
          Back to event
        </Link>

        {/* gap-12 (2xl) is the UI-SPEC's major section break between the page
            heading block and the form. */}
        <div className="flex flex-col gap-12">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold leading-[1.2] break-words">
              Order tickets — {event.name}
            </h1>
            <p className="text-base font-normal leading-[1.5] text-muted-foreground break-words">
              {formatEventDate(event.event_date)} · {event.location}
            </p>
          </div>

          {hasTicketTypes ? (
            <OrderForm eventId={eventId} ticketTypes={ticketTypes} />
          ) : (
            // Nothing to pick, so no form — a dead end otherwise. Mirrors the
            // event detail page's own empty state.
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold leading-[1.2]">
                No ticket types yet
              </h2>
              <p className="text-base font-normal leading-[1.5] text-muted-foreground">
                Add a ticket type on the event page before starting an order.
              </p>
              <Link
                href={`/events/${eventId}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Back to event
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
