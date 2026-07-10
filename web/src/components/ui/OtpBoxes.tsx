'use client';

import { useEffect, useRef, type KeyboardEvent, type ClipboardEvent } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * OtpBoxes — design system §10 (6-digit OTP row).
 *
 * Controlled: parent owns the string. Behaviours:
 *   - digit-only, one per box
 *   - auto-advance on type
 *   - backspace on empty box jumps back
 *   - paste of a 6-digit code fills all six boxes
 *   - Enter triggers `onComplete` when 6 digits are entered
 */
export interface OtpBoxesProps {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

const LEN = 6;

export function OtpBoxes({ value, onChange, onComplete, disabled, error, autoFocus }: OtpBoxesProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const chars = padTo(value, LEN);

  // Build from a fresh full-length pad of the raw `value` (real space
  // characters at every unset slot), not from `chars` above — `chars` has
  // already had its *trailing* spaces stripped by padTo, so writing past
  // its length created a sparse-array hole; `Array.join` renders holes as
  // '' rather than a real character, which silently collapsed the gap and
  // landed the typed digit one slot to the left of where it was typed.
  // Only the *trailing* run is trimmed back off before handing the value
  // up, so a fully-filled code is still a clean N-character string.
  const setChar = (i: number, ch: string): string => {
    const arr = value.slice(0, LEN).padEnd(LEN, ' ').split('');
    arr[i] = ch;
    const next = arr.join('').replace(/\s+$/, '');
    onChange(next);
    return next;
  };

  const focusIndex = (i: number) => {
    const el = refs.current[i];
    el?.focus();
    el?.select?.();
  };

  const handleKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      // A blank-but-positionally-held slot reads as a real space
      // character, not undefined — check for actual digit content so
      // backspacing an already-empty gap box still jumps back like any
      // other empty box.
      if (chars[i]?.trim()) {
        setChar(i, ' ');
      } else if (i > 0) {
        setChar(i - 1, ' ');
        focusIndex(i - 1);
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' && i > 0) focusIndex(i - 1);
    if (e.key === 'ArrowRight' && i < LEN - 1) focusIndex(i + 1);
    if (e.key === 'Enter' && value.length === LEN) onComplete?.(value);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LEN);
    if (!pasted) return;
    onChange(pasted);
    if (pasted.length === LEN) onComplete?.(pasted);
    focusIndex(Math.min(pasted.length, LEN - 1));
    e.preventDefault();
  };

  return (
    <div className="flex gap-2">
      {Array.from({ length: LEN }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={chars[i] ?? ''}
          inputMode="numeric"
          maxLength={1}
          autoComplete="one-time-code"
          disabled={disabled}
          onPaste={handlePaste}
          onChange={(e) => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1);
            if (!digit) return;
            const next = setChar(i, digit);
            if (i < LEN - 1) focusIndex(i + 1);
            // No gaps left (no internal or trailing spaces) means every box
            // genuinely holds a real digit — reusing setChar's own result
            // instead of recomputing keeps this check and the actual write
            // from ever disagreeing about position.
            if (next.replace(/\s/g, '').length === LEN) onComplete?.(next);
          }}
          onKeyDown={handleKeyDown(i)}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-[50px] w-11 rounded-md border bg-surface text-center font-mono text-lg font-semibold text-text',
            error
              ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20'
              : 'border-b-default focus:border-primary focus:ring-2 focus:ring-primary-soft',
            'focus:outline-none transition-colors duration-fast disabled:opacity-60',
          )}
          aria-label={`OTP digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

function padTo(s: string, n: number): string {
  return (s ?? '').slice(0, n).padEnd(n, ' ').trimEnd();
}
