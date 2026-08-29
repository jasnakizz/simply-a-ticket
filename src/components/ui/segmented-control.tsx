"use client"

// SegmentedControl (DS-04) — a controlled two-option toggle built on native
// radio inputs (Modernist `.seg`), no extra dependency. The only consumer is
// Phase 7's EUR / RSD currency toggle; a prop-shape tweak there is a deviation,
// not a new shared component (D-07). Radius is zero — no corner class here.

import * as React from "react"

import { cn } from "@/lib/utils"

type SegmentedControlOption = {
  value: string
  label: string
}

function SegmentedControl({
  options,
  value,
  onValueChange,
  name,
  className,
}: {
  options: SegmentedControlOption[]
  value: string
  onValueChange: (v: string) => void
  name?: string
  className?: string
}) {
  const generatedName = React.useId()
  const groupName = name ?? generatedName

  return (
    <div
      data-slot="segmented-control"
      role="radiogroup"
      className={cn(
        "inline-flex overflow-hidden border border-border",
        className
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <label
            key={option.value}
            className={cn(
              "relative inline-flex cursor-pointer items-center select-none px-3 py-[7px] text-[13px]",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary has-[:focus-visible]:-outline-offset-2",
              index > 0 && "border-l border-border",
              selected
                ? "bg-primary text-primary-foreground"
                : "hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]"
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={selected}
              onChange={() => onValueChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
export type { SegmentedControlOption }
