import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { getCurrencySymbol } from "@/lib/currency"
import type { Currency } from "@/types/api"

const amountInputVariants = cva(
  "flex w-full items-center gap-2 rounded-lg border bg-input px-3.5 has-[input:disabled]:opacity-50",
  {
    variants: {
      size: {
        default: "h-11.5 border-divider",
        lg: "h-[54px] border-accent",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const symbolVariants = cva("shrink-0 text-neutral-500", {
  variants: {
    size: {
      default: "text-lg",
      lg: "text-2xl font-medium",
    },
  },
  defaultVariants: {
    size: "default",
  },
})

const fieldVariants = cva(
  "w-full bg-transparent tabular-nums text-foreground outline-none placeholder:text-neutral-600",
  {
    variants: {
      size: {
        default: "text-lg",
        lg: "text-2xl font-medium",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

interface AmountInputProps
  extends Omit<React.ComponentProps<"input">, "size">,
    VariantProps<typeof amountInputVariants> {
  currency: Currency
  invalid?: boolean
}

function AmountInput({
  className,
  currency,
  size = "default",
  invalid,
  ...props
}: AmountInputProps) {
  return (
    <div
      data-slot="amount-input"
      className={cn(amountInputVariants({ size }), invalid && "border-destructive", className)}
    >
      <span className={symbolVariants({ size })}>{getCurrencySymbol(currency)}</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        aria-invalid={invalid}
        className={fieldVariants({ size })}
        {...props}
      />
    </div>
  )
}

export { AmountInput, amountInputVariants }
