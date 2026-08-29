import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// Root landing page (D-02): a minimal heading and two links, no data
// fetching. Kept a plain, non-async Server Component — nothing here is
// interactive, so no client-side directive is needed.
export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center pt-16 gap-4 text-center">
      <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">Simply a Ticket</h1>
      <div className="flex gap-4">
        {/* D-03: Add event goes straight to event creation, skipping the list. */}
        <Link href="/events/new" className={buttonVariants({ variant: "default" })}>
          Add event
        </Link>
        <Link href="/events" className={buttonVariants({ variant: "outline" })}>
          View events
        </Link>
      </div>
    </div>
  );
}
