"use client";

// The note island on the attendee detail page (NOTE-02/-03). "use client"
// only because it needs useActionState — the real work (zod validation, the
// single-key UPDATE) all happens server-side in saveTicketNote. This file
// wires a form to it and renders what comes back.
//
// Unlike the check-in panel's actions, this island performs no client-side
// refetch or navigation: nothing else on the attendee detail page derives
// from tickets.note, so a router.refresh() here would be a round-trip with
// no visible change. useActionState is this file's only hook.
import { useActionState } from "react";
import { CircleAlert } from "lucide-react";

import { saveTicketNote } from "@/app/actions/ticket-note";
import type { SaveTicketNoteState } from "@/app/actions/types";
import { withTimeout } from "@/lib/with-timeout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialSaveTicketNote: SaveTicketNoteState = {};

// The client-side wait bound that turns a silent hang into a visible failure
// state — same value and same reasoning as check-in-panel.tsx's TIMEOUT_MS.
const TIMEOUT_MS = 10_000;

// A byte-for-byte copy of the string saveTicketNote already returns for a
// caught database error (src/app/actions/ticket-note.ts) — copying it rather
// than inventing new copy means this island introduces no new user-visible
// failure wording. A source gate pins the two copies against each other.
const SAVE_TICKET_NOTE_NETWORK_ERROR =
  "Something went wrong saving this note. Check your connection and try again.";

// Mirrored from check-in-panel.tsx's FieldError — identical body, not
// imported. role="alert" so a screen reader announces it.
function FieldError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-center gap-1 text-[13px] text-foreground"
    >
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {message}
    </p>
  );
}

// The reducer actually passed to useActionState — a CLIENT wrapper around
// saveTicketNote, never the raw action. A rejected / hung / timed-out save
// raised inside the useActionState transition otherwise bubbles to
// src/app/events/error.tsx and collapses the subtree. Catching HERE, inside
// the reducer, and returning a SaveTicketNoteState is the only fix. The
// caught value is NEVER read (no message / code / stack / payload reaches
// rendered state) and this never re-throws.
async function saveTicketNoteWithGuard(
  prevState: SaveTicketNoteState,
  formData: FormData,
): Promise<SaveTicketNoteState> {
  try {
    return await withTimeout(saveTicketNote(prevState, formData), TIMEOUT_MS);
  } catch {
    return {
      formError: SAVE_TICKET_NOTE_NETWORK_ERROR,
      values: { note: String(formData.get("note") ?? "") },
    };
  }
}

export function NoteForm({
  ticketId,
  eventId,
  initialNote,
}: {
  ticketId: string;
  eventId: string;
  initialNote: string | null;
}) {
  // Kept on one line so the wrapper wiring is greppable as one token —
  // mirrors check-in-panel.tsx's useActionState call sites.
  const [state, action, pending] = useActionState(saveTicketNoteWithGuard, initialSaveTicketNote);

  // The Textarea below prefers state.values.note over initialNote, on BOTH
  // outcomes (success and rejection). This field is uncontrolled, and React
  // resets an uncontrolled field to its CURRENT defaultValue prop right after
  // a <form action={...}> transition settles — since initialNote never
  // changes after a save (no client-side refetch, see header comment above),
  // reading only initialNote would snap a just-saved value back to what was
  // on the page before the edit, even though the write itself already
  // succeeded. Reading state.values.note first means the reset lands on the
  // freshly-saved text instead.
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="event_id" value={eventId} />
      <Textarea
        name="note"
        className="min-h-[74px]"
        maxLength={500}
        defaultValue={state.values?.note ?? initialNote ?? ""}
        placeholder="Anything the door should know — plus one, guest of the band, still owes for a friend…"
      />
      {state.errors?.note?.[0] ? (
        <FieldError message={state.errors.note[0]} />
      ) : null}
      {state.formError ? (
        <p role="alert" className="text-[13px] text-foreground">
          {state.formError}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-[13px] text-[var(--color-checked-in)]">
          Note saved.
        </p>
      ) : null}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending}
        className="self-start"
      >
        {pending ? "Saving…" : "Save note"}
      </Button>
    </form>
  );
}
