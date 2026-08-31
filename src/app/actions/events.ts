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
//
// EVENT-V4-03 / D-02: `.refine()` runs only after every per-field `.min()`
// check above it passes — a submission with a blank start date reports the
// "Start date is required." field error, never the ordering error, because
// zod does not evaluate the object-level refinement while individual field
// parses have already failed. `path: ["ends_at"]` is load-bearing: without
// it the error attaches to the form root instead of a named field, and the
// FieldError block under the End date input never renders.
//
// Both starts_at/ends_at values here are still the bare "YYYY-MM-DD" string
// straight off an <input type="date">, which is zero-padded ISO — a plain
// string `>=` comparison is already a correct calendar-day comparison, no
// Date parsing needed for the check itself (parsing only happens later, in
// toUtcMidnightIso, for storage).
// WR-02: this app has no auth (unlisted URL, no login per .claude/CLAUDE.md),
// so a POST straight against this Server Action's endpoint is a real path,
// not just a defensive-programming exercise. A well-formed
// <input type="date"> always emits zero-padded "YYYY-MM-DD", but without
// this regex a non-date string (e.g. "abc") would sail through `.min(1, ...)`
// and reach `toUtcMidnightIso`, which calls `new Date(...).toISOString()` —
// an Invalid Date's `.toISOString()` throws an uncaught RangeError instead of
// degrading to this action's contracted formError copy. The regex rejects
// both blank/whitespace-only values (same as `.min(1, ...)` did) and
// malformed date strings, using the same field messages as before.
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const eventSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    starts_at: z.string().trim().regex(isoDatePattern, "Start date is required."),
    ends_at: z.string().trim().regex(isoDatePattern, "End date is required."),
    location: z.string().trim().min(1, "Location is required."),
  })
  .refine((data) => data.ends_at >= data.starts_at, {
    message: "End date can't be earlier than the start date.",
    path: ["ends_at"],
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
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at"),
    location: formData.get("location"),
  };

  const parsed = eventSchema.safeParse(input);

  if (!parsed.success) {
    return {
      errors: z.flattenError(parsed.error).fieldErrors,
      values: {
        name: String(input.name ?? ""),
        starts_at: String(input.starts_at ?? ""),
        ends_at: String(input.ends_at ?? ""),
        location: String(input.location ?? ""),
      },
    };
  }

  const { name, starts_at, ends_at, location } = parsed.data;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      name,
      location,
      starts_at: toUtcMidnightIso(starts_at),
      ends_at: toUtcMidnightIso(ends_at),
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
      values: { name, starts_at, ends_at, location },
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
