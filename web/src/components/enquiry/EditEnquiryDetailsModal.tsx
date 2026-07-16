'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import { isValidDDMM, ddmmToISO, isoToDDMM } from '@/lib/utils/date';
import { HOT_DAYS, WARM_DAYS } from '@/lib/utils/leadType';
import { useMasterDataValues } from '@/lib/hooks/useMasterData';
import type { EnquiryDetail } from '@/lib/api/types';

const SOURCES_FALLBACK = ['Referral', 'Website', 'Cold call', 'Exhibition', 'Partner'];

/**
 * EditEnquiryDetailsModal — matches the mockup's `Enquiry Details` edit
 * drawer. Lets an admin edit the fields visible on the details card: owner
 * (reassign), source, expected close date, and GSTIN. Company + Created are
 * read-only because they are structural. Priority (Hot/Warm/Cold) isn't
 * edited directly — it derives server-side from the close date, so this is
 * the one field that actually moves it.
 */
export function EditEnquiryDetailsModal({
  open,
  onClose,
  enquiry,
}: {
  open: boolean;
  onClose: () => void;
  enquiry: EnquiryDetail;
}) {
  const qc = useQueryClient();
  const usersQ = useQuery({
    queryKey: ['users', 'list', 'edit-enquiry'],
    queryFn: () => endpoints.users.list({ page_size: 100 }),
    enabled: open,
  });
  const activeUsers = (usersQ.data?.results ?? []).filter((u) => u.is_active);
  const sources = useMasterDataValues('source', SOURCES_FALLBACK);

  const [ownerId, setOwnerId] = useState<number | null>(enquiry.owner);
  const [source, setSource] = useState(enquiry.source);
  const [gstin, setGstin] = useState(enquiry.gstin ?? '');
  const [closeDate, setCloseDate] = useState(isoToDDMM(enquiry.expected_close_date));

  useEffect(() => {
    if (open) {
      setOwnerId(enquiry.owner);
      setSource(enquiry.source);
      setGstin(enquiry.gstin ?? '');
      setCloseDate(isoToDDMM(enquiry.expected_close_date));
    }
  }, [open, enquiry]);

  // Empty (cleared) or a real calendar date — never a half-typed mask or an
  // out-of-range day like 31/02.
  const closeDateValid = closeDate === '' || isValidDDMM(closeDate);
  const closeDateChanged = closeDate !== isoToDDMM(enquiry.expected_close_date);

  // A changed-but-invalid date blocks the whole save (see `dirty` below) —
  // this is only reached as a defense-in-depth check for a submit that
  // somehow bypasses the disabled button (e.g. a bare Enter keypress).
  const closeDateInvalid = closeDateChanged && !closeDateValid;

  const submit = useMutation({
    mutationFn: async () => {
      if (closeDateInvalid) {
        throw new Error("That date doesn't exist — fix or clear it before saving.");
      }
      const patch: Partial<EnquiryDetail> = {};
      if (source !== enquiry.source) patch.source = source;
      if (gstin.trim() !== (enquiry.gstin ?? '')) patch.gstin = gstin.trim();
      if (closeDateChanged) {
        patch.expected_close_date = closeDate ? ddmmToISO(closeDate) : null;
      }
      if (Object.keys(patch).length > 0) {
        await endpoints.enquiries.patch(enquiry.id, patch);
      }
      // ownerId legitimately includes `null` (— Unassigned —) — only skip
      // the call when it's genuinely unchanged from the current owner.
      if (ownerId !== enquiry.owner) {
        await endpoints.enquiries.reassign(enquiry.id, ownerId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  // An invalid, changed date blocks Save entirely — no partial save where
  // everything else goes through and the bad date silently stays dropped.
  const dirty =
    !closeDateInvalid
    && (ownerId !== enquiry.owner
      || source !== enquiry.source
      || gstin.trim() !== (enquiry.gstin ?? '')
      || closeDateChanged);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit enquiry details"
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form="edit-enquiry-details-form"
            loading={submit.isPending}
            disabled={!dirty}
          >
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="edit-enquiry-details-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <Field label="Company">
          <input value={enquiry.company_name} disabled className={cn(inputCls, 'bg-soft text-subtle')} />
        </Field>
        <Field label="Owner">
          <select
            value={ownerId ?? ''}
            onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : null)}
            className={inputCls}
          >
            <option value="">— Unassigned —</option>
            {activeUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Source">
          <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Expected closure date">
          <DateField value={closeDate} onChange={setCloseDate} minDate={new Date()} />
          {closeDate.length === 10 && !closeDateValid ? (
            <p className="mt-1.5 text-[11px] text-danger">That date doesn&rsquo;t exist — check the day and month.</p>
          ) : (
            <p className="mt-1.5 text-[11px] text-subtle">
              Drives Priority: ≤{HOT_DAYS}d away → Hot, ≤{WARM_DAYS}d → Warm, further out → Cold.
            </p>
          )}
        </Field>
        <Field label="GSTIN">
          <input
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            placeholder="09ABCDE1234F1Z5 · optional"
            className={cn(inputCls, 'font-mono')}
            maxLength={15}
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
