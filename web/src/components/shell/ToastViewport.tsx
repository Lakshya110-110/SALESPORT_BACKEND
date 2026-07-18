'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { timeAgo } from '@/lib/utils/format';
import { iconForType, notificationHref } from './notificationIcon';
import { subscribeToasts, dismissToast, TOAST_TTL_MS, type Toast } from '@/lib/utils/toast';

/**
 * Toast stack for realtime notifications — the "you didn't have to open the
 * bell" surface. Fed only by the Socket.IO push in AppShell, never by the
 * bell's 60s poll, so a refetch can't replay old notifications as new ones.
 *
 * Bottom-right on purpose: the bell popover opens top-right at 344px, and a
 * toast landing on top of it would cover the very list it's announcing.
 *
 * z-[90] sits above the popover (z-80) but below modals (z-95) — a toast must
 * never cover a dialog someone is actively filling in.
 */
export function ToastViewport() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (!toasts.length) return null;

  return (
    <div
      // `pointer-events-none` on the container, re-enabled per card: the empty
      // column would otherwise swallow clicks on whatever is beneath it.
      className="pointer-events-none fixed bottom-[14px] right-[14px] z-[90] flex w-[352px] max-w-[calc(100vw-28px)] flex-col gap-[10px]"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const router = useRouter();
  const n = toast.notification;
  const [Icon, tone] = iconForType(n.ntype);
  const href = notificationHref(n);

  // Auto-dismiss, paused while the pointer or keyboard focus is on the card —
  // otherwise a toast can vanish mid-sentence, or out from under the cursor
  // just as someone reaches for it.
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_TTL_MS);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const id = window.setTimeout(() => dismissToast(toast.id), remaining.current);
    return () => {
      window.clearTimeout(id);
      // Bank the time already served so resuming doesn't restart the full TTL.
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, toast.id]);

  const go = () => {
    if (!href) return;
    dismissToast(toast.id);
    router.push(href);
  };

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-[11px] rounded-lg border border-b-subtle bg-surface p-[13px] shadow-pop',
        'animate-slide-up',
        href && 'cursor-pointer hover:bg-soft',
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onClick={href ? go : undefined}
      // Only a navigable toast is interactive; a plain one stays a passive
      // status message rather than a button that does nothing.
      role={href ? 'link' : undefined}
      tabIndex={href ? 0 : undefined}
      onKeyDown={
        href
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go();
              }
            }
          : undefined
      }
    >
      <span
        className={cn('flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]', tone)}
        aria-hidden
      >
        <Icon size={16} strokeWidth={1.9} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-[1.35] text-text">{n.title}</p>
        {n.subtitle && (
          <p className="mt-[2px] break-words text-[12px] leading-[1.4] text-muted">{n.subtitle}</p>
        )}
        <p className="mt-[3px] text-[11px] text-subtle">{timeAgo(n.created_at)}</p>
      </div>

      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={(e) => {
          e.stopPropagation();
          dismissToast(toast.id);
        }}
        className="-mr-[2px] -mt-[2px] shrink-0 rounded p-[3px] text-subtle hover:bg-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
