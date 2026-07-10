'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * PhoneField — design system §10 (`.phone`).
 * Left `+91` prefix pill joined to the input.
 * Only exposes the 10-digit local number; the +91 is a visual chip.
 */
export interface PhoneFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
}

export const PhoneField = forwardRef<HTMLInputElement, PhoneFieldProps>(function PhoneField(
  { label, help, error, className, containerClassName, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name ?? undefined;
  return (
    <div className={cn('mb-4', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-text">
          {label}
        </label>
      )}
      <div className="flex">
        <span
          className={cn(
            'flex items-center rounded-l-md border border-r-0 border-b-default bg-soft px-3',
            'text-sm text-muted select-none',
          )}
          aria-hidden
        >
          +91
        </span>
        <input
          id={inputId}
          ref={ref}
          type="tel"
          inputMode="numeric"
          maxLength={11} // 10 digits + the auto-inserted space ("98765 43210")
          aria-invalid={error ? true : undefined}
          className={cn(
            'block w-full rounded-r-md border bg-surface px-3 py-2.5 text-sm text-text',
            'placeholder:text-subtle',
            'transition-colors duration-fast',
            error
              ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20'
              : 'border-b-default focus:border-primary focus:ring-2 focus:ring-primary-soft',
            'focus:outline-none',
            className,
          )}
          {...rest}
        />
      </div>
      {(help || error) && (
        <p className={cn('mt-1.5 text-[11.5px]', error ? 'text-danger' : 'text-subtle')}>
          {error ?? help}
        </p>
      )}
    </div>
  );
});
