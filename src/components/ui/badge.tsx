import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Badge / tag (DS-04). Server-safe <span>, no client directive. Mirrors the
// buttonVariants cva + VariantProps + cn skeleton from button.tsx. Three
// explicit variants, no more; `neutral` is the default so the home "3 events"
// tag, the dashboard "Doors open" tag and Phase 7's PAGE-03 "sample" markers are
// all covered without a new variant. Radius is zero — no corner class here.
// Every variant carries a 1px border whose colour is its own text colour, so
// the three event-status badges (Upcoming / Doors open / Ended) all read as
// outlined chips rather than only the outline one.
const badgeVariants = cva(
  "inline-flex items-center border text-[11px] tracking-[0.02em] px-2.5 py-[3px]",
  {
    variants: {
      variant: {
        accent:
          "border-[var(--color-accent-800)] bg-[var(--color-accent-100)] text-[var(--color-accent-800)]",
        neutral:
          "border-[var(--color-neutral-800)] bg-[var(--color-neutral-100)] text-[var(--color-neutral-800)]",
        outline: "border-primary text-primary",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
