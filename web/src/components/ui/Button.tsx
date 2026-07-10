'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Button — design system §09.
 *
 * Variants: primary / secondary / outline / ghost / danger / success / warning
 * Sizes:    md (default 9px vertical / 16px horizontal) · sm (6px / 12px) · icon
 *
 * States: hover, :active (pressed), :focus-visible ring, disabled, loading.
 * `loading` disables the button and shows a spinner in place of the icon.
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success'
  | 'warning';

export type ButtonSize = 'md' | 'sm' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    // Matches mockup `.btn-primary`: solid primary bg, shadow-tinted, hover flips to hover shade.
    'bg-primary text-primary-fg shadow-[0_6px_16px_rgba(37,71,200,0.25)] hover:bg-primary-hover active:bg-primary-hover disabled:opacity-50',
  secondary:
    // Matches `.btn-secondary`: surface bg with b-default border + card shadow.
    'bg-surface text-text border border-b-default shadow-card hover:bg-soft active:bg-soft disabled:opacity-50',
  outline:
    'bg-transparent text-primary border border-primary hover:bg-primary-soft disabled:opacity-50',
  ghost: 'bg-transparent text-muted hover:bg-soft hover:text-text disabled:opacity-50',
  danger: 'bg-danger text-white shadow-[0_6px_16px_rgba(209,67,67,0.25)] hover:opacity-90 active:opacity-80 disabled:opacity-50',
  success: 'bg-success text-white shadow-[0_6px_16px_rgba(31,157,91,0.25)] hover:opacity-90 active:opacity-80 disabled:opacity-50',
  warning: 'bg-warning text-white hover:opacity-90 active:opacity-80 disabled:opacity-50',
};

const SIZES: Record<ButtonSize, string> = {
  // Mockup `.btn`: padding 11px 18px, font 13.5/600, line-height 1.
  md: 'py-[11px] px-[18px] text-[13.5px] leading-none',
  // `.btn-sm`: padding 8px 13px, font 12.5.
  sm: 'py-[8px] px-[13px] text-[12.5px] leading-none',
  icon: 'h-9 w-9 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, leftIcon, rightIcon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        // Pill shape (rounded-full) to match the mockup's `.btn` (r-full radius).
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold leading-none',
        'transition-colors duration-fast ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : leftIcon}
      {size !== 'icon' && children}
      {!loading && rightIcon}
    </button>
  );
});

function Spinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden
    />
  );
}
