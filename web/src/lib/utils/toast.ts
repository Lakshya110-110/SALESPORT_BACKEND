import type { Notification } from '@/lib/api/types';

/**
 * Toast store — a module-level singleton rather than React context.
 *
 * The only producer is AppShell's Socket.IO handler, which lives inside a
 * `useEffect` that re-subscribes when its deps change. A context value captured
 * in that closure goes stale; a module function never does. It also means the
 * viewport can mount anywhere in the tree without a provider having to sit
 * above every caller.
 *
 * Cap: MAX_VISIBLE. A burst (bulk import, several consultants working at once)
 * must not paper the screen — oldest is dropped so the newest is always shown.
 */
export type Toast = {
  /** Notification id — also the dedupe key, see pushToast. */
  id: number;
  notification: Notification;
};

const MAX_VISIBLE = 3;

/** How long a toast stays before auto-dismissing. Long enough to read a title
 *  plus subtitle; the viewport pauses this whole timer on hover/focus. */
export const TOAST_TTL_MS = 6000;

let toasts: Toast[] = [];
const listeners = new Set<(t: Toast[]) => void>();

function emit() {
  // Fresh array each time so `useSyncExternalStore`/setState sees a new
  // reference and actually re-renders.
  const snapshot = toasts;
  listeners.forEach((fn) => fn(snapshot));
}

export function subscribeToasts(fn: (t: Toast[]) => void): () => void {
  listeners.add(fn);
  fn(toasts);
  return () => {
    listeners.delete(fn);
  };
}

export function pushToast(notification: Notification): void {
  // Socket.IO redelivers on reconnect, and a user in two rooms (own + role)
  // can legitimately receive the same notification twice. Keying on the
  // server's id means the same event never stacks two identical toasts.
  if (toasts.some((t) => t.id === notification.id)) return;
  toasts = [...toasts, { id: notification.id, notification }].slice(-MAX_VISIBLE);
  emit();
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

/** Sign-out and account switches — the next user must not inherit toasts
 *  addressed to the previous one. */
export function clearToasts(): void {
  if (!toasts.length) return;
  toasts = [];
  emit();
}
