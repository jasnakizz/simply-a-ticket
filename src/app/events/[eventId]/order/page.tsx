import Link from "next/link";
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
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

  // This guard is what keeps OrderForm from ever receiving an empty array:
  // the island has no dead blocked-state branch because this shell never
  // mounts it with nothing to select.
  const hasTicketTypes = ticketTypes && ticketTypes.length > 0;

  return (
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-[560px] px-4 py-6 flex flex-col gap-4">
        <Link
          href={`/events/${eventId}`}
          className={buttonVariants({
            variant: "ghost",
            className: "px-0 justify-start",
          })}
        >
          ← Cancel
        </Link>

        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground break-words">
            {event.name}
          </p>
          <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
            Add a sold ticket
          </h1>
          <p className="text-[12px] text-muted-foreground">
            The QR arrives in their inbox the moment you save.
          </p>
        </div>

        {hasTicketTypes ? (
          <OrderForm eventId={eventId} ticketTypes={ticketTypes} />
        ) : (
          // Nothing to pick, so no form — a dead end otherwise. Mirrors the
          // event detail page's own empty state.
          <div className="flex flex-col gap-2">
            <h2 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
              No ticket types yet
            </h2>
            <p className="text-[15px] leading-[1.55] text-muted-foreground">
              No ticket types yet — add one on the event page before selling a
              ticket.
            </p>
            <Link
              href={`/events/${eventId}`}
              className={buttonVariants({
                variant: "outline",
                className: "min-h-[44px] justify-start text-left",
              })}
            >
              Add a ticket type
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
