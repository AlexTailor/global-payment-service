import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { useMediaQuery } from "@/hooks/useMediaQuery"

function ModalRoot(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="modal" {...props} />
}

function ModalTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="modal-trigger" {...props} />
}

function ModalClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="modal-close" {...props} />
}

function ModalContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  const isDesktop = useMediaQuery("(min-width: 768px)")

  return (
    <DialogPrimitive.Portal data-slot="modal-portal">
      <DialogPrimitive.Backdrop
        data-slot="modal-backdrop"
        className={cn(
          "fixed inset-0 z-50 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          isDesktop
            ? "bg-[color-mix(in_srgb,var(--color-neutral-900)_35%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--color-neutral-900)_62%,transparent)]"
        )}
      />
      <DialogPrimitive.Popup
        data-slot="modal-content"
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-surface p-4 text-foreground shadow-lg outline-none",
          isDesktop
            ? "top-1/2 left-1/2 w-[440px] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-sheet data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
            : "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-sheet data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom",
          className
        )}
        {...props}
      >
        {!isDesktop && (
          <div
            aria-hidden
            className="mx-auto -mt-1 h-1 w-9 shrink-0 rounded-full bg-neutral-700"
          />
        )}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="modal-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function ModalHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

function ModalTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="modal-title"
      className={cn(
        "font-heading text-[20px] leading-tight font-medium tracking-[-0.015em]",
        className
      )}
      {...props}
    />
  )
}

function ModalDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="modal-description"
      className={cn("text-sm text-neutral-500", className)}
      {...props}
    />
  )
}

function ModalBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-body"
      className={cn("flex flex-col gap-4 overflow-y-auto", className)}
      {...props}
    />
  )
}

function ModalFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

export const Modal = {
  Root: ModalRoot,
  Trigger: ModalTrigger,
  Close: ModalClose,
  Content: ModalContent,
  Header: ModalHeader,
  Title: ModalTitle,
  Description: ModalDescription,
  Body: ModalBody,
  Footer: ModalFooter,
}
