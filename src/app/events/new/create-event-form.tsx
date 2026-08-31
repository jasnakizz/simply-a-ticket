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

const initialState: CreateEventState = {};

const labelClassName =
  "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-center gap-1 text-[12px] text-foreground">
      <CircleAlert aria-hidden="true" className="size-4" />
      {message}
    </p>
  );
}

export function CreateEventForm() {
  const [state, formAction, pending] = useActionState(createEvent, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.formError && <FieldError message={state.formError} />}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name" className={labelClassName}>
          Name
        </Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={state.values?.name ?? ""}
        />
        {state.errors?.name?.[0] && <FieldError message={state.errors.name[0]} />}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="starts_at" className={labelClassName}>
          Start date
        </Label>
        <Input
          id="starts_at"
          name="starts_at"
          type="date"
          required
          defaultValue={state.values?.starts_at ?? ""}
        />
        {state.errors?.starts_at?.[0] && (
          <FieldError message={state.errors.starts_at[0]} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ends_at" className={labelClassName}>
          End date
        </Label>
        <Input
          id="ends_at"
          name="ends_at"
          type="date"
          required
          defaultValue={state.values?.ends_at ?? ""}
        />
        {state.errors?.ends_at?.[0] && (
          <FieldError message={state.errors.ends_at[0]} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="location" className={labelClassName}>
          Location
        </Label>
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

      <div className="border-t-2 border-border pt-3 pb-5 grid gap-2">
        <Button
          type="submit"
          disabled={pending}
          className="min-h-[52px] justify-start text-left"
        >
          {pending ? "Creating…" : "Create event"}
        </Button>
      </div>
    </form>
  );
}
