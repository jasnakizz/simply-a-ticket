// Shared contract between the createEvent Server Action and the client form
// that calls it. This is a plain module (no "use server" directive) because
// a "use server" file may only export async functions — types/non-function
// values have to live somewhere else.
export type FieldErrors = Record<string, string[] | undefined>;

export type CreateEventState = {
  errors?: FieldErrors;
  formError?: string;
  values?: { name: string; starts_at: string; ends_at: string; location: string };
};

export type CreateTicketTypeState = {
  errors?: FieldErrors;
  formError?: string;
  values?: { name: string; description: string };
};

// Shared contract between the createOrder Server Action and the order form
// client component. Same three-key shape as the two types above.
//
// `values` declares all six order-form fields even though plan 02-03's form
// only renders the first three: plan 02-04 adds the two amount inputs and the
// currency dropdown, and pinning the contract here once means that plan
// changes a form, not a type every consumer already depends on. The two
// amounts and the currency echo back as empty strings until then.
export type OrderState = {
  errors?: FieldErrors;
  formError?: string;
  values?: {
    ticket_type_id: string;
    attendee_name: string;
    attendee_email: string;
    paid_amount: string;
    pay_at_door_amount: string;
    currency: string;
  };
};

// Shared contract between the checkInTicket Server Action (src/app/actions/
// check-in.ts) and the scanner client component. Same three-key
// errors/formError shape as the types above, plus the outcome flags the
// scanner's state machine switches on.
//
// `checkedInAt` is a string, never a Date: a Server Action return value
// crosses an RPC boundary and must be plain-serializable (a Date comes back
// as `{}` or throws). The scanner formats it for display on the client.
//
// `values` echoes back the two pay-at-the-door collected fields on a rejected
// balance-due check-in — same purpose and shape as `OrderState.values`, so a
// staff member who mistyped the figure corrects it rather than retyping it.
export type CheckInState = {
  errors?: FieldErrors;
  formError?: string;
  ok?: boolean;
  alreadyCheckedIn?: boolean;
  notFound?: boolean;
  checkedInAt?: string;
  attendeeName?: string;
  values?: {
    collected_amount: string;
    collected_currency: string;
  };
};

// Shared contract between the markAsPaid Server Action (src/app/actions/
// mark-as-paid.ts) and the attendee detail page's check-in panel. Same
// errors/formError shape as the types above, plus this action's own outcome
// flags — deliberately NOT a reuse or a widening of CheckInState.
//
// `staleBalance` is its own outcome (PAID-V6-04 / D-01), never the
// already-checked-in flag: a double-submit or a losing concurrent settle
// means the read-time snapshot no longer matches the row, which is a
// distinct fact from "this ticket was already checked in" and needs its own
// staff-facing copy ("someone already recorded a payment ... reload").
// `notSettleable` covers every other server-side refusal that isn't a field
// error — not checked in yet, cross-currency, or nothing left owed — each
// still carrying its own `formError` copy so the three refusals never read
// alike.
//
// Every value crossing the Server Action boundary is plain-serialisable (no
// Date, no class instance) for the same RPC-boundary reason CheckInState's
// `checkedInAt` is a string above.
export type MarkAsPaidState = {
  errors?: FieldErrors;
  formError?: string;
  ok?: boolean;
  staleBalance?: boolean;
  notSettleable?: boolean;
  notFound?: boolean;
  collectedAmount?: string;
  collectedCurrency?: string | null;
  values?: {
    settle_amount: string;
  };
};

// Shared contract between the markAsReturned Server Action (src/app/actions/
// mark-as-returned.ts) and the attendee detail page's check-in panel. Field-
// for-field identical to MarkAsPaidState except `values` carries
// `return_amount` instead of `settle_amount` — deliberately NOT a reuse or a
// widening of MarkAsPaidState (own type, own field name), matching that
// type's own "not a reuse" comment above.
//
// `staleBalance` here means "someone already recorded a RETURN on this
// ticket" — a distinct fact from MarkAsPaidState's stale outcome ("someone
// already recorded a payment"), even though both share the same shape and
// the same guarded compare-and-swap mechanism underneath.
export type MarkAsReturnedState = {
  errors?: FieldErrors;
  formError?: string;
  ok?: boolean;
  staleBalance?: boolean;
  notSettleable?: boolean;
  notFound?: boolean;
  collectedAmount?: string;
  collectedCurrency?: string | null;
  values?: {
    return_amount: string;
  };
};
