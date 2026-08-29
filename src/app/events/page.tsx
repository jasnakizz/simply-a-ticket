import Link from "next/link";

import { createServiceClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScanBar } from "@/components/ui/scan-bar";

// Without this, Next.js would try to prerender this route once at build
// time (hitting Supabase during the build and freezing the list at
// whatever existed then) instead of re-querying on every request. Staff
// need the current list, not a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const supabase = createServiceClient();
  const { data: events, error } = await supabase
    .from("events")
    .select("id, name, event_date")
    .order("event_date", { ascending: true })
    .order("created_at", { ascending: true });

  // Thrown here, caught by src/app/events/error.tsx (the segment error
  // boundary) — a read failure shows the contracted error copy instead of
  // an unhandled exception or a blank page.
  if (error) {
    throw error;
  }

  // D-15: the scan-bar target and the highlighted row are the first event
  // whose event_date is on or after the server's current UTC calendar day
  // (the same UTC pinning formatEventDate uses), falling back to the
  // earliest event when every one is in the past. The list is already
  // ordered ascending by event_date, so one forward scan finds the row.
  const todayUtcDay = new Date().toISOString().slice(0, 10);
  const pickedEvent = events?.length
    ? (events.find((event) => event.event_date >= todayUtcDay) ?? events[0])
    : undefined;

  return (
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-[560px] px-4 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[17px] font-extrabold tracking-[-0.02em] leading-[1.15]">
            Simply a Ticket
          </h1>
          <Badge variant="outline">{events?.length ?? 0} events</Badge>
        </div>

        {pickedEvent ? (
          <ScanBar
            size="home"
            label="Scan tickets"
            href={`/events/${pickedEvent.id}/scan`}
            eyebrow={`NEXT · ${pickedEvent.name.toUpperCase()}`}
          />
        ) : (
          <div className="bg-muted text-muted-foreground min-h-[72px] px-4 py-3 flex items-center">
            No event to scan yet
          </div>
        )}

        {events && events.length === 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
              No events yet
            </h2>
            <p className="text-[15px] leading-[1.55] text-muted-foreground">
              <Link href="/events/new" className="text-primary underline-offset-4 hover:underline">
                Create your first event to get started.
              </Link>
            </p>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              ALL EVENTS
            </p>
            <ul className="flex flex-col">
              {events?.map((event, index) => {
                const isPicked = event.id === pickedEvent?.id;
                return (
                  <li key={event.id}>
                    <Link
                      href={`/events/${event.id}`}
                      className={
                        (index === 0
                          ? "block py-3 text-[17px] font-extrabold leading-[1.15] break-words"
                          : "block py-3 text-[17px] font-extrabold leading-[1.15] break-words border-t border-border") +
                        (isPicked ? " px-4 -mx-4 bg-[var(--color-surface)]" : "")
                      }
                    >
                      {event.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="border-t-2 border-border pt-3 pb-5 grid gap-2">
          <Link
            href="/events/new"
            className={buttonVariants({
              variant: "default",
              className: "min-h-[52px] justify-start text-left",
            })}
          >
            Add event
          </Link>
        </div>
      </div>
    </div>
  );
}
