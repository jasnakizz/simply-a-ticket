"use client";

// Client Component only because useActionState needs to run in the browser to
// track the pending state and the returned errors/values. The actual work
// (validation, token, QR, email, insert) all happens server-side in
// createOrder — this file just wires the form to it and renders what comes
// back. Mirrors AddTicketTypeForm.
import { useActionState, useState, useId } from "react";
import { CircleAlert, ChevronDown } from "lucide-react";

import { createOrder } from "@/app/actions/orders";
import type { OrderState } from "@/app/actions/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SegmentedControl } from "@/components/ui/segmented-control";

const initialState: OrderState = {};

function FieldError({ message }: { message: string }) {
  // Per-field errors stay in --foreground (not --destructive): red is
  // reserved for a real external system failing, not a forgotten field.
  return (
    <p role="alert" className="flex items-center gap-1 text-[12px] text-foreground">
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {message}
    </p>
  );
}

function FormError({ message }: { message: string }) {
  // The top-level failure banner — the FIRST real use of the destructive (red)
  // token in this app. Structurally identical to FieldError (the alert role so
  // a screen reader announces it, a CircleAlert icon, icon+text in a row with a
  // gap-1), so it stays distinguishable from a per-field message even without
  // colour vision. What differs on purpose: the icon and text use the
  // destructive colour and the text is Body size instead of the smaller
  // per-field step.
  // `message` is only ever one of the two contracted strings createOrder
  // returns in `state.formError` — never a raw Postgres or Resend error.
  //
  // (Java-dev note: the alert role is an implicit assertive live region — the
  // browser's accessibility layer reads the node aloud the moment React
  // inserts it, no extra wiring needed.)
  return (
    <p
      role="alert"
      className="flex items-center gap-1 text-[15px] font-normal leading-[1.55] text-destructive"
    >
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

  // D-07: the only two pieces of client state on this form, both
  // presentation-only. Nothing here touches createOrder, the zod schema, or
  // the useActionState wiring above.
  //
  // panelOpen — the "Ticket type, payment" disclosure. Collapsed on mount and
  //   toggled only by the trigger button for the happy path. The panel ALSO
  //   reveals itself whenever panelHasError is true — i.e. when createOrder
  //   rejected one of its own three fields (ticket_type_id / paid_amount /
  //   pay_at_door_amount) — because those FieldError messages render inside it
  //   and would otherwise never reach the screen (CR-01). This open-on-error
  //   reveal is Jasna's gap-closure amendment to D-08, which originally said
  //   the panel never force-opens on a validation error.
  //   `hidden` is an attribute, not a conditional render, so the radios and
  //   both amount inputs stay in the DOM — and therefore in FormData — while
  //   the panel is collapsed.
  const [panelOpen, setPanelOpen] = useState(false);
  // currency — controlled value for the SegmentedControl. What preserves the
  //   v1 keep-what-you-typed behaviour once createOrder has bounced the form
  //   is this controlled state surviving the useActionState re-render — NOT the
  //   initialiser below. A useState initialiser runs once on mount, <OrderForm>
  //   is mounted without a `key`, so state.values is undefined when it runs;
  //   the echoed value is only the fallback for a genuine remount (D-10).
  const [currency, setCurrency] = useState(state.values?.currency || "RSD");
  // Stable id linking the disclosure trigger's aria-controls to its panel.
  const panelId = useId();

  // panelHasError — a plain derived const, NOT a hook, so the D-07 budget
  // (two useState + one useId, no effect) is untouched. True when createOrder
  // rejected any of the three in-panel fields; read through ?.[0] so it is
  // exactly co-extensive with "an in-panel FieldError will render".
  const panelHasError = Boolean(
    state.errors?.ticket_type_id?.[0] ||
      state.errors?.paid_amount?.[0] ||
      state.errors?.pay_at_door_amount?.[0],
  );

  const labelClassName =
    "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* defaultValue, not value: this input is never edited, it only carries
          the event id from the URL into formData. D-04 fixes the event by the
          URL — there is no event picker on this form. */}
      <input type="hidden" name="event_id" defaultValue={eventId} />

      {/* Top-level failure banner, above every field so it leads the form's
          reading order. Shows only when createOrder came back with a
          formError — an email that would not send, or (different copy) an
          email that sent but whose order row then failed to save. A forgotten
          field never lands here; it renders inline through FieldError instead. */}
      {state.formError && <FormError message={state.formError} />}

      {/* Fast path — attendee name and email, always visible above the
          disclosure. These are the two fields a staffer fills on every order. */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="attendee_name" className={labelClassName}>
          Attendee name
        </Label>
        <Input
          id="attendee_name"
          name="attendee_name"
          required
          maxLength={30}
          defaultValue={state.values?.attendee_name ?? ""}
        />
        {state.errors?.attendee_name?.[0] && (
          <FieldError message={state.errors.attendee_name[0]} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="attendee_email" className={labelClassName}>
          Attendee email
        </Label>
        {/* Native required + type="email" save a round-trip, but the zod check
            in createOrder is the one that matters — a Server Action is
            callable directly whether or not JavaScript ran. */}
        <Input
          id="attendee_email"
          name="attendee_email"
          type="email"
          required
          maxLength={100}
          defaultValue={state.values?.attendee_email ?? ""}
        />
        {state.errors?.attendee_email?.[0] && (
          <FieldError message={state.errors.attendee_email[0]} />
        )}
      </div>

      {/* Disclosure trigger — the explicit button type is critical: a bare
          submit-type button inside a form submits it. */}
      <button
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        aria-expanded={panelOpen || panelHasError}
        aria-controls={panelId}
        className={buttonVariants({
          variant: "outline",
          className: "w-full justify-between min-h-[44px]",
        })}
      >
        Ticket type, payment
        <ChevronDown
          aria-hidden="true"
          className={`size-4 transition-transform${panelOpen || panelHasError ? " rotate-180" : ""}`}
        />
      </button>

      {/* `hidden` (not a conditional render) keeps the radios and amount inputs
          in the DOM — and therefore in FormData — while the panel is collapsed.
          That is what makes D-08's collapsed-always safe. */}
      <div
        id={panelId}
        hidden={!panelOpen && !panelHasError}
        className="border border-border border-t-0 p-4 flex flex-col gap-4"
      >
        {/* Ticket-type picker. D-09: the first type is pre-selected so the
            collapsed panel is still submittable — an order can now be placed on
            a type the staffer did not explicitly tick. Form default only; no
            action or schema change. */}
        <div className="flex flex-col gap-2">
          <p id="ticket-type-label" className={labelClassName}>
            TICKET TYPE
          </p>
          <RadioGroup
            name="ticket_type_id"
            aria-labelledby="ticket-type-label"
            defaultValue={state.values?.ticket_type_id || ticketTypes[0]?.id}
            className="gap-4"
          >
            {ticketTypes.map((ticketType) => (
              <label
                key={ticketType.id}
                // border is always present but transparent, so selecting an
                // option changes its colour without nudging the layout.
                className="flex gap-2 border border-transparent bg-muted p-3 has-[[data-checked]]:border-primary"
              >
                <RadioGroupItem value={ticketType.id} className="mt-1" />
                <span className="flex flex-col gap-1">
                  <span className="text-[12px] font-extrabold break-words">
                    {ticketType.name}
                  </span>
                  <span className="text-[12px] text-muted-foreground break-words">
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

        {/* Both amounts are staff bookkeeping and both optional. Plain number
            inputs only — no currency symbol, no running sum. Server-side,
            amountSchema in createOrder is the check that counts. */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="paid_amount" className={labelClassName}>
              Paid now
            </Label>
            <Input
              id="paid_amount"
              name="paid_amount"
              type="number"
              step="0.01"
              defaultValue={state.values?.paid_amount ?? ""}
            />
            {state.errors?.paid_amount?.[0] && (
              <FieldError message={state.errors.paid_amount[0]} />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pay_at_door_amount" className={labelClassName}>
              Owed at door
            </Label>
            <Input
              id="pay_at_door_amount"
              name="pay_at_door_amount"
              type="number"
              step="0.01"
              defaultValue={state.values?.pay_at_door_amount ?? ""}
            />
            {state.errors?.pay_at_door_amount?.[0] && (
              <FieldError message={state.errors.pay_at_door_amount[0]} />
            )}
          </div>
        </div>

        {/* One currency control governing BOTH amounts. The explicit group
            name is not optional: without it SegmentedControl falls back to a
            generated id and the currency value silently vanishes from
            FormData. The Server Action still reads it straight from FormData,
            unchanged. */}
        <div className="flex flex-col gap-2">
          <p className={labelClassName}>CURRENCY</p>
          <SegmentedControl
            name="currency"
            options={[
              { value: "RSD", label: "RSD" },
              { value: "EUR", label: "EUR" },
            ]}
            value={currency}
            onValueChange={setCurrency}
          />
        </div>

        <p className="text-[11px] text-muted-foreground">
          {"Amounts are staff bookkeeping — never shown in the attendee's email."}
        </p>
      </div>

      {/* The pending-disabled submit button is the double-submit mitigation:
          two fast clicks would otherwise mean two tickets and two emails. No
          idempotency key — for a single-operator staff tool the disabled
          button is the proportionate control. */}
      <div className="border-t-2 border-border pt-3 pb-5 grid gap-2">
        <Button
          type="submit"
          disabled={pending}
          className="min-h-[52px] justify-start text-left"
        >
          {pending ? "Issuing…" : "Issue ticket · send email"}
        </Button>
      </div>
    </form>
  );
}
