import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn(...classes)` — the standard shadcn/ui-style className merger.
 * Combines `clsx` (conditional class composition) with `tailwind-merge`
 * (resolves conflicting Tailwind utilities so the last one wins).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
