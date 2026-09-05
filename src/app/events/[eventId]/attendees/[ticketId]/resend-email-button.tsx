"use client";

// The resend island on the attendee detail page (SEARCH-03 / SEARCH-04).
// "use client" only because it needs useActionState — the real work (the
// ticket / event / ticket-type reads, the QR regen from the stored token, the
// Resend call) all happens server-side in resendTicketEmail. This file wires a
// form to it and renders what comes back.
//
// It imports neither the server-only email module nor its send helper: that
// module carries the Resend credential behind `import "server-only"`, so any
// such import would be a build error. This island only ever touches the Server
// Action.
//
// Like note-form.tsx, this island performs no client-side refetch or
// navigation: nothing on the detail page derives from a send, so a
// router.refresh() here would be a round-trip with no visible change.
// useActionState is this file's only hook.
import { useActionState } from "react";

import { resendTicketEmail } from "@/app/actions/resend-ticket-email";
import type { ResendTicketEmailState } from "@/app/actions/types";
import { withTimeout } from "@/lib/with-timeout";
import { buttonVariants } from "@/components/ui/button";

const initialResendTicketEmail: ResendTicketEmailState = {};

// The client-side wait bound that turns a silent hang into a visible failure
// state — same value and same reasoning as note-form.tsx's TIMEOUT_MS.
const TIMEOUT_MS = 10_000;

// A byte-for-byte copy of the string resendTicketEmail already returns for a
// failed send (src/app/actions/resend-ticket-email.ts), which is itself a copy
// of the sentence createOrder returns in src/app/actions/orders.ts. Copying
// rather than inventing means this island introduces no new user-visible
// failure wording; a source gate pins the two copies against each other.
const RESEND_TICKET_EMAIL_SEND_ERROR =
  "Couldn't send the ticket email. Check your connection and try again.";

// The reducer actually passed to useActionState — a CLIENT wrapper around
// resendTicketEmail, never the raw action. A rejected / hung / timed-out POST
// raised inside the useActionState transition otherwise bubbles to
// src/app/events/error.tsx and collapses the subtree. Catching HERE, inside
// the reducer, and returning a ResendTicketEmailState is the only fix. The
// caught value is NEVER read and this never re-throws.
async function resendTicketEmailWithGuard(
  prevState: ResendTicketEmailState,
  formData: FormData,
): Promise<ResendTicketEmailState> {
  try {
    return await withTimeout(
      resendTicketEmail(prevState, formData),
      TIMEOUT_MS,
    );
  } catch {
    return { formError: RESEND_TICKET_EMAIL_SEND_ERROR };
  }
}

export function ResendEmailButton({
  ticketId,
  eventId,
}: {
  ticketId: string;
  eventId: string;
}) {
  // Kept on one line so the wrapper wiring is greppable as one token — mirrors
  // note-form.tsx's useActionState call site.
  const [state, action, pending] = useActionState(resendTicketEmailWithGuard, initialResendTicketEmail);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="event_id" value={eventId} />
      <button
        type="submit"
        disabled={pending}
        className={buttonVariants({
          variant: "secondary",
          className: "min-h-[44px] w-full justify-start text-left",
        })}
      >
        {pending ? "Sending…" : "Resend ticket email"}
      </button>
      {state.ok && state.sentTo ? (
        <p className="text-[13px] text-[var(--color-checked-in)]">
          Ticket email sent to {state.sentTo}
        </p>
      ) : null}
      {state.formError ? (
        <p role="alert" className="text-[13px] text-foreground">
          {state.formError}
        </p>
      ) : null}
    </form>
  );
}
