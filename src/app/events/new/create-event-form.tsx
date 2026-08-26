"use client";

// useActionState (from "react", not "react-dom" — it moved in React 19) is
// what wires this form to the Server Action: it gives back the action's
// last returned state, a wrapped action to hand to <form action={...}>, and
// a `pending` boolean while the action is in flight. Think of it as the
// client-side counterpart to a backend request/response cycle, except the
// "response" is just a plain object your component re-renders with.
import { useActionState } from "react";
import { CircleAlert } from "lucide-react";

import { createEvent } from "@/app/actions/events";
import type { CreateEventState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: CreateEventState = {};

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-center gap-1 text-sm text-foreground">
      <CircleAlert aria-hidden="true" className="size-4" />
      {message}
    </p>
  );
}

export function CreateEventForm() {
  const [state, formAction, pending] = useActionState(createEvent, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 p-6">
      {state.formError && <FieldError message={state.formError} />}

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

      <div className="flex flex-col gap-2">
        <Label htmlFor="event_date">Date</Label>
        <Input
          id="event_date"
          name="event_date"
          type="date"
          required
          defaultValue={state.values?.event_date ?? ""}
        />
        {state.errors?.event_date?.[0] && (
          <FieldError message={state.errors.event_date[0]} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          required
          defaultValue={state.values?.location ?? ""}
        />
        {state.errors?.location?.[0] && (
          <FieldError message={state.errors.location[0]} />
        )}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create event"}
      </Button>
    </form>
  );
}
