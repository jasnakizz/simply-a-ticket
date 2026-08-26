"use client";

import { useActionState } from "react";
import { CircleAlert } from "lucide-react";

import { createTicketType } from "@/app/actions/ticket-types";
import type { CreateTicketTypeState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: CreateTicketTypeState = {};

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-center gap-1 text-sm text-foreground">
      <CircleAlert aria-hidden="true" className="size-4" />
      {message}
    </p>
  );
}

export function AddTicketTypeForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(
    createTicketType,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.formError && <FieldError message={state.formError} />}

      {/* defaultValue, not value: a value with no onChange would make React
          treat this input as controlled and warn. This field is never
          edited by the person filling out the form — it just carries the
          event id from the page. */}
      <input type="hidden" name="event_id" defaultValue={eventId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={state.values?.name ?? ""}
        />
        {state.errors?.name?.[0] && <FieldError message={state.errors.name[0]} />}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          required
          defaultValue={state.values?.description ?? ""}
        />
        {state.errors?.description?.[0] && (
          <FieldError message={state.errors.description[0]} />
        )}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add ticket type"}
      </Button>
    </form>
  );
}
