'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Bell, Users, AlertCircle, FileText, Calendar, CheckCircle2, Info, Award } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { timeAgo } from '@/lib/utils/format';
import { endpoints } from '@/lib/api/endpoints';
import type { Notification } from '@/lib/api/types';

/**
 * NotificationsBell — matches the uploaded HTML `.notif` popover.
 *
 * Layout: 344px card, `.notif-head` (title + "Mark all read"), a scrollable
 * `.notif-list` (max 344px), and a `.notif-foot` with the "View all" CTA.
 * Icons per `ntype` use the `ni-*` colour swatches (info/danger/success/
 * warning/primary/accent/teal/success-green) from the mockup.
 *
 * Data: `GET /api/notifications/` (role-scoped on the backend) with a 60s
 * refetch interval; "Mark all read" hits `POST /notifications/mark_all_read/`.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => endpoints.notifications.list(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const markAll = useMutation({
    mutationFn: () => endpoints.notifications.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = listQ.data?.results ?? [];
  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        className={cn(
          'relative inline-flex h-[42px] w-[42px] items-center justify-center rounded-full border border-b-subtle bg-surface text-muted shadow-card',
          'hover:bg-soft hover:text-text',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft',
          open && 'text-text',
        )}
      >
        <Bell size={16} strokeWidth={1.8} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute right-[10px] top-[9px] h-[7px] w-[7px] rounded-full border-[1.5px] border-surface bg-danger"
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            'absolute right-0 top-[calc(100%+10px)] z-[80] w-[344px] overflow-hidden rounded-lg border border-b-subtle bg-surface shadow-pop',
            'animate-slide-up',
          )}
        >
          {/* notif-head */}
          <div className="flex items-center justify-between border-b border-b-subtle px-4 py-[13px]">
            <h4 className="font-display text-[16px] font-bold text-text">Notifications</h4>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-[11.5px] font-semibold text-primary hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* notif-list */}
          <div className="max-h-[344px] overflow-y-auto">
            {listQ.isLoading ? (
              <div className="p-6 text-center text-[12px] text-subtle">Loading…</div>
            ) : listQ.error ? (
              <div className="p-6 text-center text-[12px] text-danger">
                Couldn&rsquo;t load notifications.
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-[12.5px] text-subtle">
                Nothing to catch up on right now.
              </div>
            ) : (
              items.map((n) => <NotifItem key={n.id} n={n} />)
            )}
          </div>

          {/* notif-foot */}
          <div className="border-t border-b-subtle px-[14px] py-[10px]">
            <button
              type="button"
              className="w-full rounded-full border border-b-default bg-surface py-2 text-[12.5px] font-semibold text-text hover:bg-soft"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotifItem({ n }: { n: Notification }) {
  const [Icon, tone] = iconForType(n.ntype);
  return (
    <div
      className={cn(
        'flex cursor-pointer items-start gap-[11px] border-b border-b-subtle px-4 py-[11px]',
        'hover:bg-soft last:border-b-0',
      )}
    >
      <span
        className={cn(
          'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]',
          tone,
        )}
      >
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-text">{n.title}</div>
        {n.subtitle && (
          <div className="mt-[1px] truncate text-[11.5px] text-muted">{n.subtitle}</div>
        )}
        <div className="mt-[3px] text-[10.5px] text-subtle">{timeAgo(n.created_at)}</div>
      </div>
      {!n.is_read && (
        <span
          aria-hidden
          className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-primary"
        />
      )}
    </div>
  );
}

type IconTone = [React.ComponentType<{ size?: number; strokeWidth?: number }>, string];

function iconForType(t: Notification['ntype']): IconTone {
  switch (t) {
    case 'pending_approval':
      return [Info, 'bg-info-soft text-info'];
    case 'discrepancy':
      return [AlertCircle, 'bg-warning-soft text-warning'];
    case 'new_enquiry':
      return [Users, 'bg-info-soft text-info'];
    case 'overdue':
      return [AlertCircle, 'bg-danger-soft text-danger'];
    case 'proposal_opened':
      return [FileText, 'bg-success-soft text-success'];
    case 'meeting_reminder':
      return [Calendar, 'bg-warning-soft text-warning'];
    case 'deal_won':
      return [Award, 'bg-success-soft text-success'];
    case 'status_changed':
      return [CheckCircle2, 'bg-primary-soft text-primary'];
    case 'team_update':
    default:
      return [Users, 'bg-accent-soft text-accent'];
  }
}
