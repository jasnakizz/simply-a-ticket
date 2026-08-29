import { cn } from "@/lib/utils"

// CountsStrip (DS-04 / D-07) — pure presentational, no client directive so it is
// mountable inside a Server Component. Phase 7 supplies the values AND composes
// the PAGE-03 "sample" marker as a <Badge variant="neutral"> beside a figure;
// that composition is deliberately not baked in here.
//
// Zero case: an empty `items` array renders nothing. 06-UI-SPEC's "fixed
// two-column grid regardless of item count" is about the grid not reflowing to
// the count, not about drawing an empty shell — a rendered grid with no cells
// would leave an orphan 2px bottom rule under nothing, which reads as a layout
// bug rather than an empty state. Radius is zero — no corner class here.

type CountsStripItem = {
  value: string
  label: string
  accent?: boolean
}

function CountsStrip({
  items,
  size = "home",
  className,
}: {
  items: CountsStripItem[]
  size?: "home" | "dashboard"
  className?: string
}) {
  if (items.length === 0) return null

  const isDashboard = size === "dashboard"

  return (
    <div
      data-slot="counts-strip"
      className={cn("grid grid-cols-2 border-b-2 border-border", className)}
    >
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={cn(
            "px-4 py-3",
            index % 2 === 0 && "border-r-2 border-border"
          )}
        >
          <div
            className={cn(
              "font-extrabold",
              isDashboard ? "text-[44px] leading-[0.9]" : "text-[26px]",
              item.accent && "text-primary"
            )}
          >
            {item.value}
          </div>
          <div className="font-semibold text-[10px] uppercase tracking-[0.1em] opacity-55">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  )
}

export { CountsStrip }
export type { CountsStripItem }
