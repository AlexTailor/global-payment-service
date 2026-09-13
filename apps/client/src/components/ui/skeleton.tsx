import * as React from "react"
import { cn } from "cn"

function Skeleton({
  className,
  width,
  height,
  delay = 0,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  width?: number | string
  height?: number | string
  delay?: number
}) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-[3px] bg-neutral-800", className)}
      style={{
        width,
        height,
        animation: `shimmer 1.6s ease-in-out ${delay}s infinite`,
        ...style,
      }}
      {...props}
    />
  )
}

export { Skeleton }
