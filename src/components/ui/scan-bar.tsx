import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

// ScanBar (DS-04 / D-07) — pure presentational, no client directive so it is
// mountable inside a Server Component. Phase 7 supplies `href` and the
// which-event-is-live / "tonight" logic; a prop-shape tweak there is a
// deviation, not a new shared component.
//
// Security: `href` is always an app-internal route literal supplied by the
// caller — never build it by interpolating untrusted data. The framework `Link`
// opens no new browsing context, so there is no `opener` to leak; if a future
// caller ever needs an external destination it must also add
// rel="noopener noreferrer". Radius is zero — no corner class here.

type ScanBarProps = {
  href: string
  label: string
  eyebrow?: string
  size?: "home" | "dashboard"
  className?: string
}

function ScanBar({
  href,
  label,
  eyebrow,
  size = "home",
  className,
}: ScanBarProps) {
  const isDashboard = size === "dashboard"

  return (
    <Link
      data-slot="scan-bar"
      href={href}
      className={cn(
        "flex w-full items-center justify-between px-4 py-3 bg-primary text-primary-foreground hover:bg-[var(--color-accent-600)] active:bg-[var(--color-accent-700)]",
        isDashboard ? "min-h-[76px]" : "min-h-[72px]",
        className
      )}
    >
      <span className="flex flex-col">
        {eyebrow ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-85">
            {eyebrow}
          </span>
        ) : null}
        <span
          className={cn(
            "font-extrabold",
            isDashboard ? "text-[19px]" : "text-[18px]"
          )}
        >
          {label}
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className={isDashboard ? "size-[26px]" : "size-6"}
      />
    </Link>
  )
}

export { ScanBar }
export type { ScanBarProps }
