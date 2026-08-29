"use client"

// Toast (DS-04 / D-09) — a dumb presentational chip. The mounting page owns the
// message state and mounts this component conditionally, e.g.
//   const [toast, setToast] = React.useState<string | null>(null)
//   {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
// There is deliberately no app-wide toast mechanism and no root-layout wiring:
// no wrapper, no shared store, no library. The component owns only its own
// ~2.6s auto-dismiss timer.
//
// The dismiss callback is held in a ref, refreshed by a passive effect, so the
// timer effect can key on `message` alone: the documented call pattern passes an
// inline arrow, so depending the timer on the callback identity would re-arm the
// ~2.6s clock on every unrelated parent re-render.

import * as React from "react"

import { cn } from "@/lib/utils"

type ToastProps = {
  message: string
  onDismiss: () => void
  className?: string
}

function Toast({ message, onDismiss, className }: ToastProps) {
  const onDismissRef = React.useRef(onDismiss)

  React.useEffect(() => {
    onDismissRef.current = onDismiss
  })

  React.useEffect(() => {
    const t = setTimeout(() => onDismissRef.current(), 2600)
    return () => clearTimeout(t)
  }, [message])

  return (
    <div
      data-slot="toast"
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-4 right-4 bottom-24 z-50 bg-[#201e1d] text-[#f3f2f2] px-[14px] py-3 text-[13px] shadow-[var(--shadow-lg)]",
        className
      )}
    >
      {message}
    </div>
  )
}

export { Toast }
export type { ToastProps }
