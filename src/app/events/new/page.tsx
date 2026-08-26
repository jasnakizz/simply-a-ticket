import { CreateEventForm } from "@/app/events/new/create-event-form";

// A plain Server Component (no "use client", not async — it fetches
// nothing). All the interactivity lives in CreateEventForm below it.
export default function NewEventPage() {
  return (
    <div className="flex flex-col flex-1 items-center">
      <div className="w-full max-w-md">
        <h1 className="pt-6 px-6 text-2xl font-semibold leading-[1.2]">Add event</h1>
        <CreateEventForm />
      </div>
    </div>
  );
}
