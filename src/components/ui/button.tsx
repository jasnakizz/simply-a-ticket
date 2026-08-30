import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[var(--color-accent-600)] active:bg-[var(--color-accent-700)]",
        outline:
          "border-border bg-transparent hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] active:bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] aria-expanded:bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] aria-expanded:text-foreground",
        secondary:
          "border-border bg-transparent hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] active:bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] aria-expanded:bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] aria-expanded:text-foreground",
        // On the light ground, accent-coloured text under 24px or non-bold uses
        // the accent-700 ramp step: the accent role measures about 3.4:1 and the
        // 600 step about 4.28:1 against the ground, both under AA's 4.5:1 for
        // normal-size text; the 700 step clears it at about 6.4:1. The 600 step
        // stays the hover/active fill. Ref D-02 / 08-REVIEW item WR-01.
        ghost:
          "text-[var(--color-accent-700)] hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] active:bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] aria-expanded:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        block:
          "h-8 w-full justify-start gap-1.5 px-2.5 text-left has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-none px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-none px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-none [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-none",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
