"use client";

import { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import "@/styles/components/modal.css";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Modal({ open, onOpenChange, children }: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

interface ModalContentProps {
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
}

export function ModalContent({
  title,
  description,
  size = "md",
  children,
}: ModalContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="modal-overlay">
        <DialogPrimitive.Content className={`modal modal--${size}`}>
          <div className="modal__header">
            <DialogPrimitive.Title className="modal__title">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="modal__close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M12 4L4 12M4 4l8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </DialogPrimitive.Close>
          </div>
          <div className="modal__body">
            {description && (
              <DialogPrimitive.Description className="modal__description">
                {description}
              </DialogPrimitive.Description>
            )}
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  );
}

interface ModalFooterProps {
  children: ReactNode;
}

export function ModalFooter({ children }: ModalFooterProps) {
  return <div className="modal__footer">{children}</div>;
}

export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;
