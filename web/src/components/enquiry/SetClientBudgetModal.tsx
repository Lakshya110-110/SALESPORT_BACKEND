'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import { inrInput } from '@/lib/utils/format';
import { todayLocalISO } from '@/lib/utils/date';

/**
 * SetClientBudgetModal — the Client Budget stat tile has no writer anywhere
 * (`client_budget` is only ever read from negotiation rounds; Log Touchpoint's
 * Negotiation channel sets `client_offer`/`our_quote`, never `client_budget`).
 * This is the missing write path: one field, posts a negotiation round with
 * `client_budget` set and a matching Negotiation touchpoint so it also shows
 * up on the timeline.
 */
export function SetClientBudgetModal({
  open,
  onClose,
  enquiryId,
}: {
  open: boolean;
  onClose: () => void;
  enquiryId: number | string;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const qc = useQueryClient();

  const reset = () => {
    setAmount('');
    setNote('');
  };

  const submit = useMutation({
    mutationFn: async () => {
      const amt = Number(amount.replace(/,/g, '')) || 0;
      await endpoints.enquiries.logRound(enquiryId, {
        side: 'Customer ask',
        client_budget: amt,
        round_date: todayLocalISO(),
        status: 'Open',
        note: note.trim(),
      });
      return endpoints.enquiries.logTouchpoint(enquiryId, {
        channel: 'Negotiation',
        outcome: 'Open',
        note: note.trim() || `Client budget: ₹${amt.toLocaleString('en-IN')}`,
        next_action: '',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries', 'detail', String(enquiryId)] });
      reset();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Set client budget"
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            type="submit"
            form="set-client-budget-form"
            loading={submit.isPending}
            disabled={amount.trim().length === 0}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="set-client-budget-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <Field label="Client budget (₹)" required>
          <input
            value={amount}
            onChange={(e) => setAmount(inrInput(e.target.value))}
            inputMode="decimal"
            placeholder="7,00,000"
            autoFocus
            className={inputCls}
          />
        </Field>
        <Field label="Note">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Where this figure came from (optional)"
            className={inputCls}
          />
        </Field>
        <p className="text-[11px] text-subtle">
          Logged as a negotiation round and added to the timeline.
        </p>
        {submit.error && (
          <div className="rounded-md bg-danger-soft p-2 text-[12px] text-danger">
            {(submit.error as Error).message}
          </div>
        )}
      </form>
    </Modal>
  );
}

const inputCls = cn(
  'h-10 w-full rounded-md border border-b-default bg-surface px-3 text-[13px] text-text placeholder:text-subtle',
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft',
);

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}
