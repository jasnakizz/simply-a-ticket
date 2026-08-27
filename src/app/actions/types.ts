// Shared contract between the createEvent Server Action and the client form
// that calls it. This is a plain module (no "use server" directive) because
// a "use server" file may only export async functions — types/non-function
// values have to live somewhere else.
export type FieldErrors = Record<string, string[] | undefined>;

export type CreateEventState = {
  errors?: FieldErrors;
  formError?: string;
  values?: { name: string; description: string; event_date: string; location: string };
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
