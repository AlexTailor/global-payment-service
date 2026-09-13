import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const typographyVariants = cva("text-foreground", {
  variants: {
    variant: {
      body: "text-sm",
      caption: "text-[11px] text-neutral-600",
      label: "text-[11px] uppercase tracking-[.06em] text-neutral-500",
      eyebrow: "text-[11px] uppercase tracking-[.1em] text-neutral-500",
      mono: "font-mono text-xs text-neutral-500",
      amount: "tabular-nums",
      error: "text-[11.5px] text-failure-text",
    },
  },
  defaultVariants: {
    variant: "body",
  },
})

interface TypographyProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof typographyVariants> {}

function Typography({ className, variant, ...props }: TypographyProps) {
  return (
    <span
      data-slot="typography"
      className={cn(typographyVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Typography, typographyVariants }
