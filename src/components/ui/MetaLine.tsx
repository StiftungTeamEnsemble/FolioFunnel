"use client";

import { forwardRef, HTMLAttributes, ReactNode } from "react";
import "@/styles/components/meta-line.css";

export interface MetaLineProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const MetaLine = forwardRef<HTMLDivElement, MetaLineProps>(
  ({ className = "", children, ...props }, ref) => {
    const classes = ["tasks-list__meta", className].filter(Boolean).join(" ");

    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  },
);

MetaLine.displayName = "MetaLine";

export interface MetaSeparatorProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

export const MetaSeparator = forwardRef<HTMLSpanElement, MetaSeparatorProps>(
  ({ className = "", children = "•", ...props }, ref) => {
    const classes = ["tasks-list__separator", className]
      .filter(Boolean)
      .join(" ");

    return (
      <span ref={ref} className={classes} {...props}>
        {children}
      </span>
    );
  },
);

MetaSeparator.displayName = "MetaSeparator";
