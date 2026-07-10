'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Switch — accessible on/off toggle used app-wide.
 *
 * Track: 40x22 pill; knob: 18x18 with 2px gap on all four sides in both states.
 * Off knob sits at left 2px; on knob translates by (track - knob - 2*gap) = 18px,
 * so the resting positions are visually symmetric.
 *
 * Renders a real `<button role="switch">` with `aria-checked` (not a hidden
 * checkbox) so it is announced correctly by screen readers and gets keyboard
 * activation from Space/Enter for free. Wrap in a `<label>` in the caller if
 * a clickable text label is needed.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  ariaLabel,
  className,
  size = 'md',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  ariaLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const dims =
    size === 'sm'
      ? { track: 'h-4 w-7', knob: 'h-3 w-3', translate: 'translate-x-[14px]', off: 'translate-x-[2px]' }
      : { track: 'h-[22px] w-10', knob: 'h-[18px] w-[18px]', translate: 'translate-x-[20px]', off: 'translate-x-[2px]' };

  const btn = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-block shrink-0 rounded-full transition-colors duration-fast',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft',
        dims.track,
        checked ? 'bg-primary' : 'bg-b-default',
        disabled && 'cursor-not-allowed opacity-50',
        !disabled && 'cursor-pointer',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white shadow',
          'transition-transform duration-fast',
          dims.knob,
          checked ? dims.translate : dims.off,
        )}
      />
    </button>
  );

  if (label === undefined) return btn;

  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 text-[13px] text-text',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      {btn}
      {label}
    </label>
  );
}
