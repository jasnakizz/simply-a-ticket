import Link from "next/link";

import { createServiceClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";

// Without this, Next.js would try to prerender this route once at build
// time (hitting Supabase during the build and freezing the list at
// whatever existed then) instead of re-querying on every request. Staff
// need the current list, not a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const supabase = createServiceClient();
  const { data: events, error } = await supabase
    .from("events")
    .select("id, name")
    .order("event_date", { ascending: true })
    .order("created_at", { ascending: true });

  // Thrown here, caught by src/app/events/error.tsx (the segment error
  // boundary) — a read failure shows the contracted error copy instead of
  // an unhandled exception or a blank page.
  if (error) {
    throw error;
  }

  return (
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-md px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold leading-[1.2]">Events</h1>
          <Link href="/events/new" className={buttonVariants({ variant: "default" })}>
            Add event
          </Link>
        </div>

        {events && events.length === 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold leading-[1.2]">No events yet</h2>
            <p className="text-base leading-[1.5] text-muted-foreground">
              <Link href="/events/new" className="text-primary underline-offset-4 hover:underline">
                Create your first event to get started.
              </Link>
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {events?.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/events/${event.id}`}
                  className="text-base leading-[1.5] text-primary underline-offset-4 hover:underline break-words"
                >
                  {event.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
