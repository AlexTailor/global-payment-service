import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // "Primary buttons are outlined, never filled" — accent border on transparent, accent text.
        primary:
          "border-accent bg-transparent text-accent hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] active:bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]",
        // Same shape as primary, divider border and body text instead of accent.
        secondary:
          "border-divider bg-transparent text-foreground hover:bg-[color-mix(in_srgb,var(--color-neutral-500)_12%,transparent)] active:bg-[color-mix(in_srgb,var(--color-neutral-500)_22%,transparent)]",
        ghost:
          "border-transparent bg-transparent text-foreground hover:bg-[color-mix(in_srgb,var(--color-neutral-500)_12%,transparent)] active:bg-[color-mix(in_srgb,var(--color-neutral-500)_22%,transparent)]",
      },
      size: {
        default: "h-11 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        lg: "h-12 px-4 text-[15px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        sm: "h-9 gap-1 px-3 text-[0.8rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && (
        <Loader2 data-icon="inline-start" aria-hidden className="animate-spin" />
      )}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
