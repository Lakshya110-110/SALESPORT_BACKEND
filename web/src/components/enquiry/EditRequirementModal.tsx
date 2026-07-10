'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import { useMasterDataValues } from '@/lib/hooks/useMasterData';
import type { EnquiryDetail, SolutionType } from '@/lib/api/types';

const INDUSTRIES_FALLBACK = [
  'Dairy', 'FMCG', 'Beverages', 'Agri-inputs', 'Cold chain',
  'Bakery', 'Frozen foods', 'Confectionery', 'Ready-to-eat', 'Nutraceuticals',
];

// Sort String's real product lineup (SalesPort is the flagship DMS+SFA
// product this very CRM ships as) — "Other" pairs with a free-text field
// for a one-off custom ask that isn't one of the standard modules.
const SOLUTION_TYPES: SolutionType[] = [
  'SalesPort (DMS + SFA)',
  'Supply Chain Management',
  'Procurement Management',
  'Livestock Management',
  'Inventory Management',
  'Production Management',
  'Accounts Management',
  'HR Management',
  'Institute Management & Resource Optimization',
  'Other',
];

/**
 * EditRequirementModal — matches the mockup's `#reqEditDrawer`. Lets the
 * user update the requirement-analysis card's fields (industry) and the
 * free-text description in one round trip. Enquiry type is no longer
 * edited here — it derives from the expected close date (lib/utils/leadType).
 */
export function EditRequirementModal({
  open,
  onClose,
  enquiry,
}: {
  open: boolean;
  onClose: () => void;
  enquiry: EnquiryDetail;
}) {
  const qc = useQueryClient();
  const industries = useMasterDataValues('industry', INDUSTRIES_FALLBACK);
  const [industry, setIndustry] = useState(enquiry.industry);
  const [solutionType, setSolutionType] = useState<SolutionType | ''>(enquiry.solution_type);
  const [solutionTypeOther, setSolutionTypeOther] = useState(enquiry.solution_type_other);
  const [description, setDescription] = useState(enquiry.description);

  useEffect(() => {
    if (open) {
      setIndustry(enquiry.industry);
      setSolutionType(enquiry.solution_type);
      setSolutionTypeOther(enquiry.solution_type_other);
      setDescription(enquiry.description);
    }
  }, [open, enquiry]);

  const submit = useMutation({
    mutationFn: () => {
      const patch: Partial<EnquiryDetail> = {};
      if (industry !== enquiry.industry) patch.industry = industry;
      if (solutionType !== enquiry.solution_type) patch.solution_type = solutionType;
      // Only meaningful for "Other" — clear it out if the user picks a
      // standard module instead, so a stale custom note can't linger.
      const nextOther = solutionType === 'Other' ? solutionTypeOther.trim() : '';
      if (nextOther !== enquiry.solution_type_other) patch.solution_type_other = nextOther;
      if (description !== enquiry.description) patch.description = description;
      return endpoints.enquiries.patch(enquiry.id, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  const dirty =
    industry !== enquiry.industry
    || solutionType !== enquiry.solution_type
    || (solutionType === 'Other' && solutionTypeOther.trim() !== enquiry.solution_type_other)
    || description !== enquiry.description;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit requirement analysis"
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form="edit-req-form"
            loading={submit.isPending}
            disabled={!dirty}
          >
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="edit-req-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <Field label="Industry">
          <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputCls}>
            {industries.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </Field>
        <Field label="Solution offered">
          <select
            value={solutionType}
            onChange={(e) => setSolutionType(e.target.value as SolutionType | '')}
            className={inputCls}
          >
            <option value="">— Not set —</option>
            {SOLUTION_TYPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {solutionType === 'Other' && (
            <input
              value={solutionTypeOther}
              onChange={(e) => setSolutionTypeOther(e.target.value)}
              placeholder="What are we actually offering them?"
              className={cn(inputCls, 'mt-2')}
              maxLength={200}
            />
          )}
        </Field>
        <div className="rounded-md bg-soft p-3 text-[11.5px] text-muted">
          Enquiry type (Hot / Warm / Cold) is now derived automatically from the
          expected close date — edit the close date to change it.
        </div>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Modules requested, expected users, current pain points…"
            className={cn(inputCls, 'h-auto py-2')}
          />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
        {label}
      </span>
      {children}
    </label>
  );
}
