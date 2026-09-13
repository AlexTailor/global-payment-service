import { ArrowDownLeft, ArrowUpRight, Loader2, X } from "lucide-react"
import { cn } from "cn"

type Status = "COMPLETED" | "PROCESSING" | "FAILED"
type Direction = "in" | "out"

function StatusIcon({
  status,
  direction,
  className,
}: {
  status: Status
  direction: Direction
  className?: string
}) {
  return (
    <div
      data-slot="status-icon"
      className={cn(
        "flex size-[30px] shrink-0 items-center justify-center rounded-full",
        status === "FAILED" ? "bg-failure-bg" : "bg-neutral-900",
        className
      )}
    >
      {status === "PROCESSING" ? (
        <Loader2 className="size-3.5 animate-spin text-accent-400" />
      ) : status === "FAILED" ? (
        <X className="size-3.5 text-failure-text" />
      ) : direction === "in" ? (
        <ArrowDownLeft className="size-3.5 text-foreground" />
      ) : (
        <ArrowUpRight className="size-3.5 text-foreground" />
      )}
    </div>
  )
}

export { StatusIcon }
