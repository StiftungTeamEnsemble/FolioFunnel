"use client";

import {
  forwardRef,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import "@/styles/components/input.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, ...props }, ref) => {
    const classes = ["input", error && "input--error", className]
      .filter(Boolean)
      .join(" ");

    return <input ref={ref} className={classes} {...props} />;
  },
);

Input.displayName = "Input";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", error, ...props }, ref) => {
    const classes = [
      "input",
      "input--textarea",
      error && "input--error",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return <textarea ref={ref} className={classes} {...props} />;
  },
);

Textarea.displayName = "Textarea";

export interface InputGroupProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function InputGroup({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: InputGroupProps) {
  return (
    <div className="input-group">
      {label && (
        <LabelPrimitive.Root
          htmlFor={htmlFor}
          className={`input-group__label ${required ? "input-group__label--required" : ""}`}
        >
          {label}
        </LabelPrimitive.Root>
      )}
      {children}
      {error && <span className="input-group__error">{error}</span>}
      {hint && !error && <span className="input-group__hint">{hint}</span>}
    </div>
  );
}
