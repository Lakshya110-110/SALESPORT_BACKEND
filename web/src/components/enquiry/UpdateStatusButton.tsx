'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import type { EnquiryStatus, LostReason } from '@/lib/api/types';

const LOST_REASONS: LostReason[] = [
  'Price',
  'Timing',
  'Competitor',
  'No budget',
  'No response',
  'Feature gap',
  'Went in-house',
  'Other',
];

const ALL_STATUSES: EnquiryStatus[] = [
  'Enquiry',
  'Qualified',
  'Meeting Scheduled',
  'Meeting Done',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Lost',
];

const TONE: Record<string, string> = {
  Enquiry: 'bg-info',
  Qualified: 'bg-primary',
  'Meeting Scheduled': 'bg-accent',
  'Meeting Done': 'bg-primary',
  'Proposal Sent': 'bg-info',
  Negotiation: 'bg-warning',
  Won: 'bg-success',
  Lost: 'bg-danger',
};

/**
 * UpdateStatusButton — a secondary Button that opens a status dropdown on
 * click and PATCHes `/change_status/` when a new status is picked. Replaces
 * the earlier modal + drawer flow: clicking is one hop, no dialog.
 */
export function UpdateStatusButton({
  enquiryId,
  status,
}: {
  enquiryId: number | string;
  status: EnquiryStatus;
}) {
  const [open, setOpen] = useState(false);
  // When the user picks "Lost", we pause the flow to ask for a reason before
  // firing the PATCH. `pendingLost` holds the status that's waiting on the
  // reason picker.
  const [pendingLost, setPendingLost] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const change = useMutation({
    mutationFn: ({ next, lost_reason }: { next: EnquiryStatus; lost_reason?: LostReason }) =>
      endpoints.enquiries.changeStatus(enquiryId, next, lost_reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false);
      setPendingLost(false);
    },
  });

  const pickStatus = (s: EnquiryStatus) => {
    if (s === 'Lost') {
      setPendingLost(true);
      return;
    }
    change.mutate({ next: s });
  };
  const pickLostReason = (reason: LostReason) => {
    change.mutate({ next: 'Lost', lost_reason: reason });
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        loading={change.isPending}
        rightIcon={<ChevronDown size={14} />}
      >
        Update status
      </Button>
      {open && !pendingLost && (
        <div
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-56 overflow-hidden rounded-lg border border-b-subtle bg-surface p-1 shadow-pop animate-slide-up"
        >
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickStatus(s)}
              disabled={change.isPending}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px]',
                s === status ? 'bg-primary-soft text-primary' : 'text-text hover:bg-soft',
                change.isPending && 'opacity-50',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', TONE[s] ?? 'bg-soft')} />
              <span className="flex-1 font-semibold">{s}</span>
              {s === status && <Check size={13} className="text-primary" />}
            </button>
          ))}
        </div>
      )}
      {open && pendingLost && (
        <div
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-60 overflow-hidden rounded-lg border border-b-subtle bg-surface p-1 shadow-pop animate-slide-up"
        >
          <div className="px-2.5 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-subtle">
            Why did we lose?
          </div>
          {LOST_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => pickLostReason(r)}
              disabled={change.isPending}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] text-text hover:bg-soft',
                change.isPending && 'opacity-50',
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-danger" />
              <span className="flex-1 font-semibold">{r}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPendingLost(false)}
            className="mt-1 w-full rounded-md px-2.5 py-1.5 text-left text-[11.5px] font-semibold text-subtle hover:bg-soft hover:text-text"
          >
            ← Back
          </button>
        </div>
      )}
      {change.error && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-56 rounded-md bg-danger-soft p-2 text-[11px] text-danger shadow-md">
          {(change.error as Error).message}
        </div>
      )}
    </div>
  );
}
