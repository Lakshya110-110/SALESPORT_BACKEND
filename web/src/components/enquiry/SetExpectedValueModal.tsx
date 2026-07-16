'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import { VALUE_BANDS, bandById, bandFor } from '@/lib/utils/valueBand';

/**
 * SetExpectedValueModal — the "Expected deal value" stat tile's writer.
 *
 * Deal value is picked as a RANGE, not typed: nobody knows the exact figure
 * this early. What gets stored is the band's midpoint, because the dashboard
 * still Sum()s expected_value for pipeline/won value — so those KPIs are
 * estimates built from midpoints, by design.
 *
 * Opens on the band the current figure falls in, so saving without touching
 * the dropdown is a no-op rather than a silent re-banding.
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
  const currentBandId = bandFor(currentValue)?.id ?? '';
  const [bandId, setBandId] = useState(currentBandId);
  const qc = useQueryClient();

  const reset = () => setBandId(currentBandId);

  const submit = useMutation({
    mutationFn: () => {
      const mid = bandById(bandId)?.mid ?? 0;
      return endpoints.enquiries.patch(enquiryId, { expected_value: String(mid) });
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
            disabled={!bandId || bandId === currentBandId}
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
        <Field label="Expected deal value" required>
          <select
            value={bandId}
            onChange={(e) => setBandId(e.target.value)}
            autoFocus
            className={inputCls}
          >
            <option value="">Select a range…</option>
            {VALUE_BANDS.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
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
