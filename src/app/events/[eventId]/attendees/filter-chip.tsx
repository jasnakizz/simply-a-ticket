import Link from "next/link";

import { cn } from "@/lib/utils";

// A server-rendered toggle chip: one next/link that carries the base, selected
// and unselected class sets. It is a plain module — no client directive, no
// hook, no state. It builds no href and reads no query string: href
// construction lives in the page, so this file has exactly one responsibility
// and no knowledge of the filter vocabulary. The Modernist system is
// zero-radius, so there is no corner class here.
export function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center min-h-[44px] px-4 text-[13px] font-semibold",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]",
      )}
    >
      {label}
    </Link>
  );
}
