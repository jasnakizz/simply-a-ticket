// The first route handler in this codebase (PDF-01, PDF-02, PDF-03).
//
// Everywhere else this app does a write with a Server Action and a read inside a
// Server Component. A `route.ts` file is different: it exports functions named
// for HTTP methods (`GET` here) and is the right shape when a *browser
// navigation* triggers the work — following an `<a download>` link to this URL
// — rather than a form or button submit inside the app UI. There is no React,
// no JSX; the handler returns a Web `Response` whose body is the raw PDF bytes.
//
// `runtime` is pinned to "nodejs" for visibility only — it is already the Next
// 16 default (the edge runtime is deprecated), but pdfkit and `Buffer` are
// Node-only so making that requirement explicit in the file is worth the line.
// `dynamic = "force-dynamic"` matches the attendees page: staff always get a
// live read, never a build-time snapshot.
//
// PDF-02 / D-05 — FILTER INDEPENDENCE IS STRUCTURAL. This handler takes no
// argument beyond the params context, never reads a query string, a search
// param or the request URL, and does its OWN Supabase reads (sharing nothing
// with the page). It therefore *cannot* see the attendees page's active
// chips/search — the exported PDF is always the whole event roster. A source
// gate (test/app/pages/roster-pdf.route.source.test.ts) holds that property.
//
// Security: every read is scoped to the path `eventId` (parity with the page —
// a missing / non-uuid id collapses to notFound()); the handler performs no row
// mutation and mints no token; `Cache-Control: no-store` keeps a roster full of
// attendee names out of any intermediary cache (threat T-25-04).
import { notFound } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/server";
import { attendeeMoneyStrip } from "@/lib/attendee-money";
import { sumResidualOwedByCurrency } from "@/lib/door-money";
import {
  buildRosterPdf,
  type RosterRow,
} from "@/lib/roster-pdf/build-roster-pdf";
import { rosterContentDisposition } from "@/lib/roster-pdf/content-disposition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = createServiceClient();

  // The only 404 this handler produces — a missing row or a malformed
  // (non-uuid) id, exactly as the attendees page treats it.
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, starts_at, ends_at")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError || !event) {
    notFound();
  }

  const { data: ticketTypes } = await supabase
    .from("ticket_types")
    .select("id, name")
    .eq("event_id", eventId);
  const ticketTypeNames = new Map(
    (ticketTypes ?? []).map((type) => [type.id, type.name]),
  );

  // The same column list and the same Postgres order the attendees page uses,
  // minus attendee_email (the roster does not print it). Ordering is the
  // database's — attendee_name A-Z with an explicit id tiebreak so identical
  // names keep a reload-stable order — and buildRosterPdf never re-sorts.
  const { data: attendees, error: attendeesError } = await supabase
    .from("tickets")
    .select(
      "id, attendee_name, ticket_type_id, status, checked_in_at, pay_at_door_amount::text, currency, pay_at_door_collected_amount::text, pay_at_door_collected_currency",
    )
    .eq("event_id", eventId)
    .order("attendee_name", { ascending: true })
    .order("id", { ascending: true });
  if (attendeesError) {
    throw attendeesError;
  }

  const rows: RosterRow[] = (attendees ?? []).map((attendee) => {
    // D-01/D-02: the per-row owed cell is byte-for-byte the predicate the
    // on-screen row's `owedLabel` uses — print iff the strip reports a positive
    // "Owes" balance, otherwise a blank cell. Same helper, so paper and screen
    // can never disagree.
    const strip = attendeeMoneyStrip(attendee);
    const owed =
      strip.balanceLabel === "Owes" && strip.balance !== null
        ? { amount: strip.balance, currency: strip.balanceCurrency }
        : null;

    // The same check-in guard the attendees page uses: a non-empty string that
    // parses to a real instant.
    const checkedInAt = attendee.checked_in_at;
    const isCheckedIn =
      typeof checkedInAt === "string" &&
      checkedInAt !== "" &&
      !Number.isNaN(new Date(checkedInAt).getTime());

    return {
      name: attendee.attendee_name,
      typeLabel: ticketTypeNames.get(attendee.ticket_type_id) ?? "",
      owed,
      isCheckedIn,
    };
  });

  // D-03: attendee count + per-currency residual owed, routed through the
  // frozen door-money helper over the raw ticket array. Never re-derived — the
  // array is handed to buildRosterPdf as-is (EUR-then-RSD, no zero/cross
  // entries) and drawn onto page 1 one line per currency.
  const summary = {
    count: rows.length,
    owed: sumResidualOwedByCurrency(attendees ?? []),
  };

  const buffer = await buildRosterPdf(rows, summary, {
    eventName: event.name,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    generatedAt: new Date(),
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": rosterContentDisposition(event.name),
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
}
