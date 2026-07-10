'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Input — design system §10.
 *
 * Wrapper handles label, help text, error state, and a 3px `--primary-soft`
 * focus halo. Extras (icons, prefixes) can be added via composition; keep
 * the primitive focused.
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
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
      <input
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={cn(
          'block w-full rounded-md border bg-surface px-3 py-2.5 text-sm text-text',
          'placeholder:text-subtle',
          'transition-colors duration-fast',
          error
            ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20'
            : 'border-b-default focus:border-primary focus:ring-2 focus:ring-primary-soft',
          'focus:outline-none disabled:bg-soft disabled:text-disabled disabled:cursor-not-allowed',
          'read-only:bg-soft',
          className,
        )}
        {...rest}
      />
      {(help || error) && (
        <p className={cn('mt-1.5 text-[11.5px]', error ? 'text-danger' : 'text-subtle')}>
          {error ?? help}
        </p>
      )}
    </div>
  );
});
