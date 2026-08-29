"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { CircleAlert } from "lucide-react";

import { createTicketType } from "@/app/actions/ticket-types";
import type { CreateTicketTypeState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toast } from "@/components/ui/toast";

const initialState: CreateTicketTypeState = {};

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

export function AddTicketTypeForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(
    createTicketType,
    initialState
  );

  // Toast is a dumb page-owned chip (D-22): this island owns the message state
  // and mounts <Toast> conditionally. No provider, no app-wide mechanism.
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // The submitted name is captured client-side at submit time: createTicketType
  // returns a bare empty object on success and echoes no `values`, so the name
  // is not available from `state` afterwards. A ref (not state) is used so the
  // capture triggers no re-render and cannot race the success effect below.
  const submittedNameRef = useRef<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    submittedNameRef.current = String(data.get("name") ?? "");
  }

  // Fires once per action result (keyed on the state object alone). Early-exits
  // when nothing has been submitted, when the state is still the initial object
  // by identity, and when the result carries errors — a rejected save raises no
  // toast and clears the captured name so it cannot leak into a later success.
  useEffect(() => {
    if (submittedNameRef.current === null) return;
    if (state === initialState) return;
    if (state.errors || state.formError) {
      submittedNameRef.current = null;
      return;
    }
    setToastMessage(`Ticket type saved · ${submittedNameRef.current}`);
    submittedNameRef.current = null;
  }, [state]);

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      {state.formError && <FieldError message={state.formError} />}

      {/* defaultValue, not value: a value with no onChange would make React
          treat this input as controlled and warn. This field is never
          edited by the person filling out the form — it just carries the
          event id from the page. */}
      <input type="hidden" name="event_id" defaultValue={eventId} />

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
        <Label htmlFor="description" className={labelClassName}>
          Description
        </Label>
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

      <div className="border-t-2 border-border pt-3 pb-5 grid gap-2">
        <Button
          type="submit"
          disabled={pending}
          className="min-h-[52px] justify-start text-left"
        >
          {pending ? "Saving…" : "Save ticket type"}
        </Button>
      </div>

      {toastMessage !== null && (
        <Toast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </form>
  );
}
