// classifyScan — the pure five-state scan classifier (SCAN-02).
//
// Decision D-18: a pay-at-the-door amount of NULL and one of 0 are treated
// identically here — both are a plain valid ticket. Only an amount strictly
// greater than zero classifies as "balance due".
//
// The Phase 2 money contract is that a monetary value is a STRING from
// Postgres all the way to the screen, never a JavaScript number, so the exact
// stored decimal (e.g. "2000.00") survives with its trailing digits intact.
// This module honours that: the single `Number()` call below is confined to
// the `> 0` comparison that decides the branch. The amount is carried forward
// with `String()` — never converted for storage or display. This is the one
// place in the app where the string-end-to-end rule LOOKS like it is being
// broken but is not.
//
// Unlike src/lib/qr.ts, this module carries no server-restriction import
// marker, so the pure function stays importable from the node test
// environment and from client code.

export type ScanResult =
  | { kind: "not_found" }
  | { kind: "wrong_event" }
  | { kind: "already_checked_in"; attendeeName: string; checkedInAt: string }
  | { kind: "valid"; attendeeName: string; ticketTypeName: string }
  | {
      kind: "valid_balance_due";
      attendeeName: string;
      ticketTypeName: string;
      balanceAmount: string;
      balanceCurrency: "EUR" | "RSD";
    };

// The subset of a `tickets` row the classifier needs. `pay_at_door_amount`
// is typed `string | number | null` on purpose: PostgREST's serialisation of
// a Postgres `numeric` is not guaranteed to be a JS number, and the
// classifier must be correct either way (RESEARCH Open Question 3).
export type ScanTicketRow = {
  event_id: string;
  attendee_name: string;
  status: "issued" | "checked_in";
  checked_in_at: string | null;
  pay_at_door_amount: string | number | null;
  currency: "EUR" | "RSD" | null;
};

export function classifyScan(
  row: ScanTicketRow | null,
  ticketTypeName: string | null,
  pageEventId: string,
): ScanResult {
  // Order is fixed and load-bearing.

  // 1. No row at all — an unreadable or unknown token.
  if (!row) return { kind: "not_found" };

  // 2. A real ticket, but for another event. Compared in JavaScript rather
  //    than filtered out in SQL, so "wrong event" stays distinguishable from
  //    "not found" (D-11) — the lookup query filters by qr_token alone.
  if (row.event_id !== pageEventId) return { kind: "wrong_event" };

  // 3. Already checked in — carry the original timestamp back untouched.
  if (row.status === "checked_in") {
    return {
      kind: "already_checked_in",
      attendeeName: row.attendee_name,
      checkedInAt: row.checked_in_at ?? "",
    };
  }

  // 4. Issued. Branch on the pay-at-the-door balance. D-18: NULL and 0 both
  //    fall through to a plain valid ticket; only `> 0` is balance-due.
  const owed = row.pay_at_door_amount;
  const hasBalance = owed !== null && Number(owed) > 0;
  if (hasBalance) {
    return {
      kind: "valid_balance_due",
      attendeeName: row.attendee_name,
      ticketTypeName: ticketTypeName ?? "",
      balanceAmount: String(owed),
      balanceCurrency: (row.currency ?? "RSD") as "EUR" | "RSD",
    };
  }

  return {
    kind: "valid",
    attendeeName: row.attendee_name,
    ticketTypeName: ticketTypeName ?? "",
  };
}
