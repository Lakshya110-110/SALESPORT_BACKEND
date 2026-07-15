'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AmountHint } from '@/components/ui/AmountHint';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import { inrInput } from '@/lib/utils/format';
import { validatePdfFile } from '@/lib/utils/file';
import type { Proposal } from '@/lib/api/types';

const STATUSES: Proposal['status'][] = ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected'];
const MAX_MB = 10;

/**
 * Upload proposal — the file is POSTed as a real multipart part to
 * `/proposals/`. Django saves it under `MEDIA_ROOT/proposals/…` (or S3 when
 * `FILE_STORAGE=s3` is set) and echoes back a working absolute URL in
 * `file_url`, which the timeline links to.
 */
export function UploadProposalModal({
  open,
  onClose,
  enquiryId,
  suggestedTitle,
  suggestedAmount,
}: {
  open: boolean;
  onClose: () => void;
  enquiryId: number;
  suggestedTitle?: string;
  suggestedAmount?: number;
}) {
  const [title, setTitle] = useState(suggestedTitle ?? '');
  const [amount, setAmount] = useState(suggestedAmount ? inrInput(String(suggestedAmount)) : '');
  const [status, setStatus] = useState<Proposal['status']>('Sent');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();

  const pickFile = (f: File | null | undefined) => {
    if (!f) { setFile(null); return; }
    const err = validatePdfFile(f, MAX_MB);
    if (err) { alert(err); return; }
    setFile(f);
  };

  const reset = () => {
    setTitle(suggestedTitle ?? '');
    setAmount(suggestedAmount ? inrInput(String(suggestedAmount)) : '');
    setStatus('Sent');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Pick a proposal file first.');
      return endpoints.proposals.upload({
        enquiry: enquiryId,
        title: title.trim(),
        amount: amount ? Number(amount.replace(/,/g, '')) : 0,
        status,
        file,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries', 'detail', String(enquiryId)] });
      qc.invalidateQueries({ queryKey: ['proposals'] });
      reset();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Upload proposal"
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="proposal-form"
            loading={submit.isPending}
            disabled={!title.trim() || !file}
          >
            Save proposal
          </Button>
        </>
      }
    >
      <form
        id="proposal-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          submit.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Title" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Proposal — Param Dairy · Rev 1"
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Amount (INR)">
            <input
              value={amount}
              onChange={(e) => setAmount(inrInput(e.target.value))}
              inputMode="decimal"
              placeholder="5,00,000"
              className={inputCls}
            />
            <AmountHint value={amount} />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Proposal['status'])}
              className={inputCls}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Proposal file" required>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => pickFile(e.target.files?.[0])}
            className="sr-only"
          />
          {file ? (
            <div className="flex items-center gap-3 rounded-md border border-b-default bg-soft p-3">
              <FileText size={18} className="shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-text">{file.name}</div>
                <div className="text-[11.5px] text-subtle">
                  {(file.size / 1024).toFixed(1)} KB · {file.type || 'file'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="text-[12px] font-semibold text-subtle hover:text-danger"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-6 text-center transition-colors',
                dragOver
                  ? 'border-primary bg-primary-soft/40 text-primary'
                  : 'border-b-default bg-soft/50 text-subtle hover:border-primary/60 hover:text-primary',
              )}
            >
              <Upload size={22} />
              <span className="text-[13px] font-semibold text-text">Click to upload or drop here</span>
              <span className="text-[11.5px]">PDF up to {MAX_MB} MB</span>
            </button>
          )}
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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
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
