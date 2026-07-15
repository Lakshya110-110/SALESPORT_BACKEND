'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import { inrInput } from '@/lib/utils/format';
import { AmountHint } from '@/components/ui/AmountHint';

/**
 * SetExpectedValueModal — the "Expected deal value" stat tile's writer.
 * `expected_value` is a plain field on Enquiry (set at creation, otherwise
 * never edited anywhere in the UI) — this is the missing edit path, same
 * shape as SetClientBudgetModal next to it in the stat strip.
 */
export function SetExpectedValueModal({
  open,
  onClose,
  enquiryId,
  currentValue,
}: {
  open: boolean;
  onClose: () => void;
  enquiryId: number | string;
  currentValue: string;
}) {
  const [amount, setAmount] = useState(() =>
    Number(currentValue) > 0 ? inrInput(currentValue) : '',
  );
  const qc = useQueryClient();

  const reset = () => {
    setAmount(Number(currentValue) > 0 ? inrInput(currentValue) : '');
  };

  const submit = useMutation({
    mutationFn: () => {
      const amt = Number(amount.replace(/,/g, '')) || 0;
      return endpoints.enquiries.patch(enquiryId, { expected_value: String(amt) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries', 'detail', String(enquiryId)] });
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      reset();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Set expected deal value"
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            type="submit"
            form="set-expected-value-form"
            loading={submit.isPending}
            disabled={amount.trim().length === 0}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="set-expected-value-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <Field label="Expected deal value (₹)" required>
          <input
            value={amount}
            onChange={(e) => setAmount(inrInput(e.target.value))}
            inputMode="decimal"
            placeholder="7,00,000"
            autoFocus
            className={inputCls}
          />
          <AmountHint value={amount} />
        </Field>
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
