import { RadioGroup } from "@base-ui/react/radio-group"
import { Radio } from "@base-ui/react/radio"
import { cn } from "cn"

function SegmentedControlRoot<Value extends string>({
  className,
  ...props
}: RadioGroup.Props<Value> & { className?: string }) {
  return (
    <RadioGroup
      data-slot="segmented-control"
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-lg border border-divider bg-bg p-1",
        className
      )}
      {...props}
    />
  )
}

function SegmentedControlOption<Value>({
  className,
  children,
  ...props
}: Radio.Root.Props<Value>) {
  return (
    <Radio.Root
      data-slot="segmented-control-option"
      className={cn(
        "flex h-9 flex-1 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-neutral-500 transition-colors data-checked:bg-surface data-checked:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </Radio.Root>
  )
}

export const SegmentedControl = {
  Root: SegmentedControlRoot,
  Option: SegmentedControlOption,
}
