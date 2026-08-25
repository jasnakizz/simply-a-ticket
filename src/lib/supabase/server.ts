import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service-role key.
//
// There is no auth anywhere in v1 (single operator, unlisted URL), so there
// is no cookie-aware browser session to wire up (unlike a typical Next.js +
// Supabase tutorial that reaches for @supabase/ssr). Every read and write in
// this app happens from trusted server code (a Server Action or a Server
// Component render), so a single service-role client is sufficient — it
// bypasses RLS entirely, which is fine because RLS on `events`/`ticket_types`
// has zero client-facing policies (see supabase/migrations/0001_...sql):
// the only way in is this client.
//
// `import "server-only"` (must stay the first statement) turns an accidental
// import of this module into a Client Component ("use client" file) into a
// build-time error instead of leaking the service-role key to the browser.
// Belt-and-suspenders: neither env var below carries the public-exposure
// prefix Next.js looks for, so Next.js already strips both from any client
// bundle regardless.
export function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing SUPABASE_URL environment variable");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }

  return createClient(url, serviceRoleKey);
}
