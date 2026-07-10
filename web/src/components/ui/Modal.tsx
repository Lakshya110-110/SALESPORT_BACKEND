'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Modal — centered dialog. Rendered via `createPortal` into `document.body`
 * so it isn't captured by an ancestor's `transform`/`will-change`/`filter`
 * (any of which turn the ancestor into a containing block for
 * `position: fixed`, which was making modals appear shifted-down and
 * clipped when a page's outer wrapper used a CSS animation).
 *
 * Sizes:  sm 480 · md 640 · lg 840. Panel uses `max-h-[88dvh]` so mobile
 * browsers respect the visible area minus URL bar; overflow inside the body.
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[840px]',
};

export function Modal({ open, onClose, title, size = 'sm', children, footer }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    // Lock body scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ height: '100dvh' }}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 animate-fade bg-ink/50"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel — the panel itself is the ONE scroll container (matches the
          reference mockup's `.modal{overflow:auto}` with sticky `.modal-h`/
          `.modal-f`), not a flex column with a nested flex-1 scrolling body.
          That nested approach depends on the flex item picking up a
          definite height from `max-height` before its `min-h-0` shrink can
          kick in — a single `overflow-y-auto` box with sticky header/footer
          sidesteps that entirely and can't silently fail to scroll. */}
      <div
        className={cn(
          'sp-scroll relative w-full overflow-y-auto rounded-dialog border border-b-subtle bg-surface shadow-modal',
          'animate-scale-in',
          SIZE[size],
        )}
        style={{ maxHeight: '88dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-b-subtle bg-surface px-5 py-4">
          <h2 className="font-display text-[16px] font-semibold text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-subtle transition-colors duration-fast hover:bg-soft hover:text-text"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-b-subtle bg-surface px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
