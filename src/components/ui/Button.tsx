'use client';

import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import '@/styles/components/button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  isIcon?: boolean;
  fullWidth?: boolean;
  asChild?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      isIcon = false,
      fullWidth = false,
      asChild = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';

    const classes = [
      'button',
      `button--${variant}`,
      `button--${size}`,
      isIcon && 'button--icon',
      isLoading && 'button--loading',
      fullWidth && 'button--full',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <Comp
        ref={ref}
        className={classes}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <span className="button__spinner" />}
        {children}
      </Comp>
    );
  }
);

Button.displayName = 'Button';
