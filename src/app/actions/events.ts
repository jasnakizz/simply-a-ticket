"use server";

// A Server Action: an async function marked "use server" that Next.js turns
// into a callable RPC-style endpoint. It can be wired directly to a
// <form action={...}> (progressive enhancement, works without client JS) or
// called from a Client Component. Unlike a typical REST controller method,
// there's no separate route file or request/response object to construct —
// this function IS the write endpoint.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import { toUtcMidnightIso } from "@/lib/date";
import type { CreateEventState } from "@/app/actions/types";

// zod v4 dropped the `invalid_type_error`/`required_error` constructor
// options that most tutorials (including Next.js's own forms guide) still
// show — `.min(1, "message")` works identically across zod 3 and 4 and
// sidesteps the ambiguity entirely. `.trim()` runs first so a
// whitespace-only submission is rejected AND the value we eventually store
// has no stray padding.
const eventSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  description: z.string().trim().min(1, "Description is required."),
  event_date: z.string().trim().min(1, "Date is required."),
  location: z.string().trim().min(1, "Location is required."),
});

// `prevState` is React's useActionState convention: the action receives its
// own previous return value as the first argument every time it runs again,
// which is how the form "remembers" errors/values across a failed submit
// without any client-side state management.
export async function createEvent(
  prevState: CreateEventState,
  formData: FormData
): Promise<CreateEventState> {
  // Extract fields individually rather than spreading the whole FormData
  // into a plain object — React's form machinery injects extra
  // $ACTION_-prefixed keys into that object that would otherwise leak into
  // the parsed input.
  const input = {
    name: formData.get("name"),
    description: formData.get("description"),
    event_date: formData.get("event_date"),
    location: formData.get("location"),
  };

  const parsed = eventSchema.safeParse(input);

  if (!parsed.success) {
    return {
      errors: z.flattenError(parsed.error).fieldErrors,
      values: {
        name: String(input.name ?? ""),
        description: String(input.description ?? ""),
        event_date: String(input.event_date ?? ""),
        location: String(input.location ?? ""),
      },
    };
  }

  const { name, description, event_date, location } = parsed.data;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      name,
      description,
      location,
      event_date: toUtcMidnightIso(event_date),
    })
    .select("id")
    .single();

  if (error) {
    // Log the real Postgres error server-side only — the browser gets the
    // contracted generic copy, never raw schema/constraint detail.
    console.error(error);
    return {
      formError:
        "Something went wrong saving this event. Check your connection and try again.",
      values: { name, description, event_date, location },
    };
  }

  // revalidatePath tells Next.js "the cached data for this route is stale,
  // refetch it" — the App Router equivalent of invalidating a cache entry,
  // done in one line instead of a manual cache-busting header.
  revalidatePath("/events");
  // redirect() works by throwing a special control-flow error internally,
  // so it must never sit inside a try/catch — a catch block would swallow
  // that throw and leave the user staring at a dead form.
  redirect(`/events/${data.id}`);
}
