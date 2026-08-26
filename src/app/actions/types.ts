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
