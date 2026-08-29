import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { CreateEventForm } from "@/app/events/new/create-event-form";

// A plain Server Component (no "use client", not async — it fetches
// nothing). All the interactivity lives in CreateEventForm below it.
export default function NewEventPage() {
  return (
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-[560px] px-4 py-6 flex flex-col gap-4">
        <Link
          href="/events"
          className={buttonVariants({
            variant: "ghost",
            className: "px-0 justify-start",
          })}
        >
          ← Events
        </Link>
        <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
          Add event
        </h1>
        <CreateEventForm />
      </div>
    </div>
  );
}
