"use client";

import { ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import "@/styles/components/select.css";

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  children: ReactNode;
}

export function Select({
  value,
  onValueChange,
  placeholder,
  children,
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger className="select__trigger">
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="select__icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="select__content"
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="select__viewport">
            {children}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

interface SelectItemProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
}

export function SelectItem({ value, children, disabled }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      className={`select__item ${disabled ? "select__item--disabled" : ""}`}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="select__item-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M3 8l3 3 7-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectGroup({ children }: { children: ReactNode }) {
  return <SelectPrimitive.Group>{children}</SelectPrimitive.Group>;
}

export function SelectLabel({ children }: { children: ReactNode }) {
  return (
    <SelectPrimitive.Label className="select__group-label">
      {children}
    </SelectPrimitive.Label>
  );
}

export function SelectSeparator() {
  return <SelectPrimitive.Separator className="select__separator" />;
}
