"use server";

// Mirrors createEvent's Server Action shape exactly, scoped to one event:
// module-level zod schema, individually extracted formData.get(...) fields,
// safeParse, service-role insert, generic error copy on a DB failure,
// revalidatePath instead of redirect (decision D-01 keeps everything on one
// page — the ticket-types list re-renders under the form, no navigation).
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/server";
import type { CreateTicketTypeState } from "@/app/actions/types";

// `event_id` arrives from a hidden form field, so it is browser-supplied
// input, not something the developer typed — it must be validated like any
// other untrusted value. z.uuid() rejects a malformed id here; the
// ticket_types.event_id foreign key is the second, database-level backstop
// that rejects an id that is a well-formed uuid but matches no event.
//
// No uniqueness check on `name`: decision D-08 deliberately allows
// duplicate ticket type names within an event, and decision D-09 puts no
// cap on how many an event may have.
const ticketTypeSchema = z.object({
  event_id: z.uuid("Event is required."),
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(30, "Name must be 30 characters or fewer."),
  description: z.string().trim().min(1, "Description is required."),
});

export async function createTicketType(
  prevState: CreateTicketTypeState,
  formData: FormData
): Promise<CreateTicketTypeState> {
  const input = {
    event_id: formData.get("event_id"),
    name: formData.get("name"),
    description: formData.get("description"),
  };

  const parsed = ticketTypeSchema.safeParse(input);

  if (!parsed.success) {
    // Echo back only name/description — event_id comes from the page's own
    // hidden field, not from anything the person typed, so there is
    // nothing useful to echo back for it.
    return {
      errors: z.flattenError(parsed.error).fieldErrors,
      values: {
        name: String(input.name ?? ""),
        description: String(input.description ?? ""),
      },
    };
  }

  const { event_id, name, description } = parsed.data;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("ticket_types")
    .insert({ event_id, name, description })
    .select("id")
    .single();

  if (error) {
    // Log the real Postgres error server-side only — a tampered event_id
    // that fails the foreign key surfaces here as `error`, and the browser
    // gets the same generic copy as any other database failure, never the
    // raw constraint text.
    console.error(error);
    return {
      formError:
        "Something went wrong saving this ticket type. Check your connection and try again.",
      values: { name, description },
    };
  }

  // No redirect — decision D-01 keeps the add form and the list on the same
  // page. Two revalidations, the orders.ts sequential-call precedent: the first
  // keeps the dashboard row's "Ticket types · N" count fresh, and the second is
  // what makes a newly saved type appear in the list on the dedicated
  // ticket-types screen the operator is already looking at — with no navigation
  // (TYPES-V4-05, decision D-08).
  revalidatePath(`/events/${event_id}`);
  revalidatePath(`/events/${event_id}/ticket-types`);
  return {};
}
