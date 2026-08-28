// The anchored decimal validator for a staff-entered money amount, shared by
// the order form (src/app/actions/orders.ts) and the pay-at-the-door check-in
// (src/app/actions/check-in.ts).
//
// It lived inline in orders.ts first and was lifted here verbatim — same
// pattern, same message, same empty-to-undefined transform — because orders.ts
// carries a "use server" directive and a "use server" module may only export
// async functions, so check-in.ts cannot import the schema object from it. One
// copy, one message, one behaviour.
//
// The value stays a *string* end to end: it is never turned into a JavaScript
// number on the way to a Postgres `numeric` column, so it cannot pick up
// floating-point drift before Postgres parses it (this is why 19.99 stores as
// exactly 19.99). A blank or whitespace-only input means "no amount recorded"
// and becomes `undefined`, which the caller writes as SQL NULL — deliberately
// different from a recorded `0` (NULL = "unknown", 0 = "nothing to collect").
//
// The pattern is anchored at both ends (^…$) so a value with trailing
// characters cannot slip through, allows at most two fractional digits, and
// carries no leading minus — that is how "non-negative" is enforced, by the
// shape of the string rather than a numeric comparison. No upper bound: Phase 2
// decided explicitly that there is no cap and Phase 3 adds none.
import { z } from "zod";

export const amountSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .refine((value) => value === undefined || /^\d+(\.\d{1,2})?$/.test(value), {
    message: "Enter a non-negative amount with up to 2 decimal places.",
  });

// toTwoDecimals / formatMoney: pure string-in / string-out money formatting,
// siblings of amountSchema and, like it, importable from a plain Node context
// (this module imports only zod, carries no server-only marker and no
// "use server" directive).
//
// Why a padding regex and not a numeric formatter: converting a money string to
// a JavaScript number and back drops the second decimal on a whole value
// ("2000" would come back as "2000", not "2000.00") and can introduce
// binary-floating-point drift on fractional values. JS has no BigDecimal in the
// language, and the platform fixed-decimal formatter goes through a double, so
// string-in / string-out is the only path that cannot drift — and this string
// is shown to someone counting cash.
//
// The body of toTwoDecimals is copied verbatim from the local helper in
// src/app/events/[eventId]/scan/scanner-client.tsx (that file is frozen by
// test/app/scan/scanner-client.source.test.ts). Deduping the two copies is a
// later phase's cleanup, decision D-10; until then a change here must be
// mirrored there by hand.
export function toTwoDecimals(raw: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) return raw;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return `${match[1]}.${fraction}`;
}

// The D-09 display contract in one place: the two-decimal amount, exactly one
// U+0020 space, then the currency code ("EUR" or "RSD"). No locale grouping
// separator, no non-breaking space, no currency-symbol table.
export function formatMoney(amount: string, currency: string): string {
  return `${toTwoDecimals(amount)} ${currency}`;
}
