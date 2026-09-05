"use server";

// The note write path for the attendee detail page (NOTE-01..03). A sibling
// of markAsPaid / markAsReturned in shape — module-level fixed staff-facing
// copy, one formData.get per field, safeParse before any database call, a
// service-role client, console.error only for the real error — but
// DELIBERATELY NOT a compare-and-swap the way those two are.
//
// markAsPaid and markAsReturned need a guarded predicate set (a snapshot
// read, then an UPDATE scoped by that snapshot) because a lost update there
// silently corrupts a money balance and breaks an exactly-once check-in
// promise. A note carries no arithmetic and no such promise, and this is a
// single-operator tool (.claude/CLAUDE.md) — a stale-snapshot refusal here
// would cost the operator her own typing to prevent an overwrite she caused
// herself. So this action is a plain last-write-wins single-statement
// UPDATE: saving the same text twice is a no-op, and two overlapping saves
// resolve last-write-wins with no error state. It revalidates nothing and
// redirects nowhere, matching the mark-as-paid / mark-as-returned precedent
// (D-06) — the panel's caller re-reads the page, this action just writes.
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import type { SaveTicketNoteState } from "@/app/actions/types";

// Two fixed staff-facing sentences — no database detail in either. Every
// failure path returns one of these; the real error, if any, goes to
// console.error only. The not-found sentence is a byte-identical copy of the
// constant mark-as-returned.ts already uses for the same outcome (copied
// rather than invented, per house convention).
const SAVE_TICKET_NOTE_NETWORK_ERROR =
  "Something went wrong saving this note. Check your connection and try again.";
const SAVE_TICKET_NOTE_NOT_FOUND =
  "Couldn't find this ticket. Reload the page and try again.";

// The cap runs BEFORE the empty-to-undefined transform, so a 501-character
// body is reported as over-length rather than silently passing through as
// "not blank". Over-length input is rejected outright, never shortened to
// fit — the standing LIMIT-V5-04/-05 house rule (test/app/actions/
// orders.schema.test.ts pins the same rule on its three neighbours).
const saveTicketNoteSchema = z.object({
  ticket_id: z.uuid(),
  event_id: z.uuid(),
  note: z
    .string()
    .trim()
    .max(500, "Note must be 500 characters or fewer.")
    .transform((value) => (value === "" ? undefined : value)),
});

export async function saveTicketNote(
  _prevState: SaveTicketNoteState,
  formData: FormData,
): Promise<SaveTicketNoteState> {
  // Individual reads, one per field — spreading FormData would also sweep in
  // React's own action-bookkeeping keys ($ACTION_*).
  const rawTicketId = formData.get("ticket_id");
  const rawEventId = formData.get("event_id");
  const rawNote = formData.get("note");

  const parsed = saveTicketNoteSchema.safeParse({
    ticket_id: rawTicketId ?? "",
    event_id: rawEventId ?? "",
    note: rawNote ?? "",
  });

  if (!parsed.success) {
    // Echo what the staff member typed so a rejected save does not blank the
    // field (React resets an uncontrolled input to its default once the
    // action settles).
    return {
      errors: z.flattenError(parsed.error).fieldErrors,
      values: { note: String(rawNote ?? "") },
    };
  }

  const { ticket_id: ticketId, event_id: eventId, note } = parsed.data;

  const supabase = createServiceClient();

  // A SINGLE .update() call whose patch object has exactly one key. Scoped
  // by BOTH id and event_id — the same IDOR scoping the detail page's read
  // uses (D-14 / T-17-02): without the event scope, a ticket id belonging to
  // another event is still a well-formed uuid this could write. No
  // compare-and-swap predicate — this is deliberately last-write-wins.
  const { data: updated, error: updateError } = await supabase
    .from("tickets")
    .update({ note: note ?? null })
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .select("note")
    .maybeSingle();

  if (updateError) {
    console.error(updateError);
    return { formError: SAVE_TICKET_NOTE_NETWORK_ERROR };
  }

  if (!updated) {
    return {
      ok: false,
      notFound: true,
      formError: SAVE_TICKET_NOTE_NOT_FOUND,
    };
  }

  return { ok: true };
}
