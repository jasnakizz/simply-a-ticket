import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Badge / tag (DS-04). Server-safe <span>, no client directive. Mirrors the
// buttonVariants cva + VariantProps + cn skeleton from button.tsx. Three
// explicit variants, no more; `neutral` is the default so the home "3 events"
// tag, the dashboard "Doors open" tag and Phase 7's PAGE-03 "sample" markers are
// all covered without a new variant. Radius is zero — no corner class here.
const badgeVariants = cva(
  "inline-flex items-center text-[11px] tracking-[0.02em] px-2.5 py-[3px]",
  {
    variants: {
      variant: {
        accent:
          "bg-[var(--color-accent-100)] text-[var(--color-accent-800)]",
        neutral:
          "bg-[var(--color-neutral-100)] text-[var(--color-neutral-800)]",
        outline: "border border-primary text-primary",
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
