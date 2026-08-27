"use client";

// Client Component only because useActionState needs to run in the browser to
// track the pending state and the returned errors/values. The actual work
// (validation, token, QR, email, insert) all happens server-side in
// createOrder — this file just wires the form to it and renders what comes
// back. Mirrors AddTicketTypeForm.
import { useActionState } from "react";
import { CircleAlert } from "lucide-react";

import { createOrder } from "@/app/actions/orders";
import type { OrderState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const initialState: OrderState = {};

function FieldError({ message }: { message: string }) {
  // Per-field errors stay in --foreground (not --destructive): red is
  // reserved for a real external system failing, not a forgotten field.
  return (
    <p role="alert" className="flex items-center gap-1 text-sm text-foreground">
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {message}
    </p>
  );
}

type TicketTypeOption = { id: string; name: string; description: string };

export function OrderForm({
  eventId,
  ticketTypes,
}: {
  eventId: string;
  ticketTypes: TicketTypeOption[];
}) {
  const [state, formAction, pending] = useActionState(createOrder, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* defaultValue, not value: this input is never edited, it only carries
          the event id from the URL into formData. D-04 fixes the event by the
          URL — there is no event picker on this form. */}
      <input type="hidden" name="event_id" defaultValue={eventId} />

      {/* Ticket-type picker — the page's primary visual anchor: it is the
          first control, carries the most text, and is the only non-text-entry
          decision on the form. A radio list, not a <select>, so each option's
          description stays visible (D-02). */}
      <div className="flex flex-col gap-2">
        <p
          id="ticket-type-label"
          className="text-sm font-semibold leading-[1.4]"
        >
          Ticket type
        </p>
        <RadioGroup
          name="ticket_type_id"
          aria-labelledby="ticket-type-label"
          defaultValue={state.values?.ticket_type_id || undefined}
          className="gap-4"
        >
          {ticketTypes.map((ticketType) => (
            <label
              key={ticketType.id}
              // border is always present but transparent, so selecting an
              // option changes its colour without nudging the layout. The
              // accent border pairs with the radio dot's own data-checked
              // accent from the generated RadioGroupItem.
              className="flex gap-2 rounded-md border border-transparent bg-muted p-2 has-[[data-checked]]:border-primary"
            >
              <RadioGroupItem value={ticketType.id} className="mt-1" />
              <span className="flex flex-col gap-1">
                <span className="text-sm font-semibold leading-[1.4] break-words">
                  {ticketType.name}
                </span>
                <span className="text-base font-normal leading-[1.5] break-words">
                  {ticketType.description}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {state.errors?.ticket_type_id?.[0] && (
          <FieldError message={state.errors.ticket_type_id[0]} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="attendee_name">Attendee name</Label>
        <Input
          id="attendee_name"
          name="attendee_name"
          required
          defaultValue={state.values?.attendee_name ?? ""}
        />
        {state.errors?.attendee_name?.[0] && (
          <FieldError message={state.errors.attendee_name[0]} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="attendee_email">Attendee email</Label>
        {/* Native required + type="email" save a round-trip, but the zod check
            in createOrder is the one that matters — a Server Action is
            callable directly whether or not JavaScript ran. */}
        <Input
          id="attendee_email"
          name="attendee_email"
          type="email"
          required
          defaultValue={state.values?.attendee_email ?? ""}
        />
        {state.errors?.attendee_email?.[0] && (
          <FieldError message={state.errors.attendee_email[0]} />
        )}
      </div>

      {/* disabled={pending} is the double-submit mitigation: two fast clicks
          would otherwise mean two tickets and two emails. No idempotency key
          — for a single-operator staff tool the disabled button is the
          proportionate control. */}
      <Button type="submit" disabled={pending}>
        {pending ? "Confirming…" : "Confirm order"}
      </Button>
    </form>
  );
}
