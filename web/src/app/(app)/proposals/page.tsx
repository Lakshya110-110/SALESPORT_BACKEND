'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Upload, Download, Search } from 'lucide-react';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { MiniKpi, MiniKpiStrip } from '@/components/ui/MiniKpi';
import { CheckCircle2, Eye, Send, Clock as ClockIcon } from 'lucide-react';
import { endpoints } from '@/lib/api/endpoints';
import { fmtInr, ddmm } from '@/lib/utils/format';
import { validatePdfFile } from '@/lib/utils/file';
import { cn } from '@/lib/utils/cn';
import { SortableTh } from '@/components/ui/SortableTh';
import { useTableSort } from '@/lib/hooks/useTableSort';
import type { EnquiryListItem, Proposal } from '@/lib/api/types';

const PROPOSAL_SORT = {
  title: (p: Proposal) => p.title?.toLowerCase(),
  enquiry: (p: Proposal) => p.enquiry,
  status: (p: Proposal) => p.status,
  sent: (p: Proposal) => p.sent_at ?? p.created_at,
  amount: (p: Proposal) => Number(p.amount) || 0,
};

/**
 * Proposals — /proposals.
 *
 * Page-level "Upload proposal" opens a modal matching the uploaded HTML's
 * `#uploadDrawer`: filedrop, Title, Value, Status. Upload-only PDFs stored
 * against a chosen enquiry (Phase 8 will replace the `file_url` text field
 * with real S3 upload; today it stores metadata + a client-side data URL).
 */
export default function ProposalsPage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['proposals', 'list'],
    queryFn: () => endpoints.proposals.list({ page_size: 100 }),
  });
  const rows = q.data?.results ?? [];
  const kpi = {
    totalSent: rows.filter((p) => p.status === 'Sent' || p.status === 'Viewed' || p.status === 'Accepted').length,
    opened:    rows.filter((p) => p.status === 'Viewed' || p.status === 'Accepted').length,
    won:       rows.filter((p) => p.status === 'Accepted').length,
    awaiting:  rows.filter((p) => p.status === 'Sent' || p.status === 'Draft').length,
  };
  const s = search.trim().toLowerCase();
  const filtered = rows.filter(
    (p) => !s || (p.title ?? '').toLowerCase().includes(s) || String(p.enquiry).includes(s),
  );
  const { sorted, activeKey, dir, onSort } = useTableSort(filtered, PROPOSAL_SORT);

  return (
    <>
      <SectionHeader
        title="Proposals"
        subtitle="All proposals uploaded. Upload-only PDFs — no approval gate."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Download size={14} />}
              onClick={() => exportProposalsCsv(filtered)}
              disabled={filtered.length === 0}
            >
              Export
            </Button>
            <Button leftIcon={<Upload size={14} />} onClick={() => setUploadOpen(true)}>
              Upload proposal
            </Button>
          </>
        }
      />
      <div className="w-full px-3 pt-3 pb-5 xl:px-4">
        <MiniKpiStrip>
          <MiniKpi label="Total Sent" value={kpi.totalSent} tone="primary" icon={<Send size={17} strokeWidth={1.9} />} />
          <MiniKpi label="Opened" value={kpi.opened} tone="warning" icon={<Eye size={17} strokeWidth={1.9} />} />
          <MiniKpi label="Won" value={kpi.won} tone="success" icon={<CheckCircle2 size={17} strokeWidth={1.9} />} />
          <MiniKpi label="Awaiting" value={kpi.awaiting} tone="primary" icon={<ClockIcon size={17} strokeWidth={1.9} />} />
        </MiniKpiStrip>

        <div className="rounded-lg border border-b-subtle bg-surface shadow-card">
          {/* Search bar — above the internally-scrolling table (Enquiries pattern). */}
          <div className="flex items-center gap-2 border-b border-b-default px-3 py-2.5">
            <div className="relative min-w-[200px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search proposal title or enquiry #…"
                className="h-9 w-full rounded-md border border-b-default bg-surface pl-9 pr-3 text-[12.5px] text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
              />
            </div>
            <span className="shrink-0 text-[11.5px] text-subtle">
              {filtered.length} of {rows.length}
            </span>
          </div>
          <div className="sp-scroll overflow-auto" style={{ maxHeight: 'calc(100dvh - 300px)' }}>
          <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-b-default bg-sunken">
                  <SortableTh label="Proposal" sortKey="title" activeKey={activeKey} dir={dir} onSort={onSort} />
                  <SortableTh label="Enquiry" sortKey="enquiry" activeKey={activeKey} dir={dir} onSort={onSort} />
                  <SortableTh label="Status" sortKey="status" activeKey={activeKey} dir={dir} onSort={onSort} />
                  <SortableTh label="Sent" sortKey="sent" activeKey={activeKey} dir={dir} onSort={onSort} />
                  <SortableTh label="Amount" sortKey="amount" align="right" activeKey={activeKey} dir={dir} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {q.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-b-subtle">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="h-4 sp-skeleton" />
                      </td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-[12.5px] text-subtle">
                      {rows.length === 0 ? (
                        <>
                          No proposals yet.{' '}
                          <button className="text-primary hover:underline" onClick={() => setUploadOpen(true)}>
                            Upload the first one
                          </button>.
                        </>
                      ) : (
                        'No proposals match your search or filter.'
                      )}
                    </td>
                  </tr>
                ) : (
                  sorted.map((p) => <Row key={p.id} p={p} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <UploadProposalModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  );
}

function Row({ p }: { p: Proposal }) {
  return (
    <tr className="border-t border-b-subtle hover:bg-soft">
      <Td>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-info-soft text-info">
            <FileText size={14} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-text">{p.title}</div>
            {p.file_url ? (
              <a
                href={p.file_url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[11px] text-primary hover:underline"
              >
                Open file
              </a>
            ) : (
              <div className="text-[11px] text-subtle">No file attached</div>
            )}
          </div>
        </div>
      </Td>
      <Td>
        <Link href={`/enquiries/${p.enquiry}`} className="text-primary hover:underline">
          #{p.enquiry}
        </Link>
      </Td>
      <Td><StatusPill s={p.status} /></Td>
      <Td>{p.sent_at ? ddmm(p.sent_at) : ddmm(p.created_at)}</Td>
      <Td className="text-right font-mono tabular-nums">{fmtInr(p.amount)}</Td>
    </tr>
  );
}

// -------------------- upload modal --------------------

function UploadProposalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<Proposal['status']>('Sent');
  const [enquiryQuery, setEnquiryQuery] = useState('');
  const [enquiry, setEnquiry] = useState<EnquiryListItem | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const enquiriesQ = useQuery({
    queryKey: ['enquiries', 'upload-proposal', enquiryQuery],
    queryFn: () => endpoints.enquiries.list({ search: enquiryQuery, page_size: 6 }),
    enabled: open && enquiryQuery.trim().length >= 2,
  });

  const readFile = (f: File) => {
    const err = validatePdfFile(f);
    if (err) { alert(err); return; }
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const reset = () => {
    setFile(null); setTitle(''); setValue('');
    setStatus('Sent'); setEnquiryQuery(''); setEnquiry(null);
  };

  const submit = useMutation({
    mutationFn: () => {
      if (!enquiry) throw new Error('Pick an enquiry to attach this proposal to.');
      if (!file) throw new Error('Pick a proposal file first.');
      return endpoints.proposals.upload({
        enquiry: enquiry.id,
        title: title.trim(),
        amount: value ? Number(value.replace(/,/g, '')) : Number(enquiry.expected_value) || 0,
        status,
        file,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['enquiries', 'detail'] });
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
          <Button type="button" variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            type="submit"
            form="upload-proposal-form"
            loading={submit.isPending}
            disabled={!enquiry || !title.trim() || !file}
          >
            Upload proposal
          </Button>
        </>
      }
    >
      <form
        id="upload-proposal-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <div className="rounded-md bg-soft p-3 text-[12.5px] text-muted">
          Upload-only — PDFs are stored against the enquiry. There is no approval gate.
        </div>

        {/* Enquiry picker */}
        <Field label="Enquiry" required>
          <div className="relative">
            <input
              className={inputCls}
              placeholder="Search enquiry / company…"
              value={enquiryQuery}
              onChange={(e) => { setEnquiryQuery(e.target.value); setEnquiry(null); }}
            />
            {enquiryQuery.length >= 2 && (enquiriesQ.data?.results ?? []).length > 0 && !enquiry && (
              <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-lg border border-b-subtle bg-surface shadow-pop">
                {(enquiriesQ.data?.results ?? []).map((e: EnquiryListItem) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEnquiry(e);
                        setEnquiryQuery(`${e.company_name} · ${e.lead_id}`);
                        if (!title.trim()) setTitle(`Proposal — ${e.company_name}`);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] hover:bg-soft"
                    >
                      <span className="truncate text-text">{e.company_name}</span>
                      <span className="ml-2 shrink-0 font-mono tabular-nums text-[11px] text-subtle">{e.lead_id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        {/* Filedrop — matches `.filedrop` from the HTML mockup:
            1.5px dashed border, r-md radius, --soft bg, --subtle text,
            hover flips border + text to --primary. */}
        <Field label="Proposal file" required>
          <label
            data-testid="proposal-filedrop"
            onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropActive(false);
              const f = e.dataTransfer.files[0];
              if (f) readFile(f);
            }}
            className={cn(
              'block cursor-pointer rounded-md border-[1.5px] border-dashed p-[22px] text-center text-[12.5px] transition-colors',
              dropActive || file
                ? 'border-primary bg-primary-soft/40 text-primary'
                : 'border-b-default bg-soft text-subtle hover:border-primary hover:text-primary',
            )}
          >
            <Upload size={24} strokeWidth={1.7} className="mx-auto mb-2" />
            {file ? (
              <>
                <div><b className="font-bold text-text">{file.name}</b></div>
                <span className="mt-[5px] block text-[11px]">
                  {(file.size / 1024).toFixed(1)} KB · click to replace
                </span>
              </>
            ) : (
              <>
                <div>
                  <b className="font-bold text-text">Click to upload</b> or drag a PDF here
                </div>
                <span className="mt-[5px] block text-[11px]">PDF up to 10 MB</span>
              </>
            )}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
            />
          </label>
        </Field>

        <Field label="Title" required>
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. SalesPort ERP — Param Dairy v2"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Proposal value (₹)">
            <input
              className={inputCls}
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d,]/g, ''))}
              placeholder={enquiry ? String(Number(enquiry.expected_value).toLocaleString('en-IN')) : '4,50,000'}
              inputMode="decimal"
            />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as Proposal['status'])} className={inputCls}>
              <option>Sent</option>
              <option>Viewed</option>
              <option>Accepted</option>
              <option>Rejected</option>
              <option>Draft</option>
            </select>
          </Field>
        </div>

        {submit.error && (
          <div className="rounded-md bg-danger-soft p-2 text-[12px] text-danger">
            {(submit.error as Error).message}
          </div>
        )}
      </form>
    </Modal>
  );
}

// -------------------- primitives --------------------

function StatusPill({ s }: { s: Proposal['status'] }) {
  const tone: Record<string, string> = {
    Draft: 'bg-soft text-muted',
    Sent: 'bg-info-soft text-info',
    Viewed: 'bg-primary-soft text-primary',
    Accepted: 'bg-success-soft text-success',
    Rejected: 'bg-danger-soft text-danger',
  };
  return (
    <span className={cn('inline-flex rounded-sm px-1.5 py-0.5 text-[11px] font-semibold', tone[s])}>
      {s}
    </span>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-semibold text-muted">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  // Docks below the 76px section header AND the ~57px sticky search bar
  // (76 + 57 = 133), so the column headers sit right under the search row
  // while the list scrolls under both.
  return (
    <th
      className={cn(
        'sticky top-0 z-10 bg-sunken px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-subtle',
        'shadow-[inset_0_-1px_0_var(--b-default)]',
        className,
      )}
    >
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>;
}

const inputCls = cn(
  'w-full rounded-md border border-b-default bg-surface px-3 py-[10px] text-[13px] text-text placeholder:text-subtle',
  'focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-soft',
);

// silence unused-import warnings for lucide icons referenced only via string keys.
void Plus;

function exportProposalsCsv(rows: Proposal[]) {
  if (!rows.length) return;
  const cols: Array<[string, (p: Proposal) => string]> = [
    ['Title',     (p) => p.title ?? ''],
    ['Enquiry',   (p) => String(p.enquiry)],
    ['Status',    (p) => p.status ?? ''],
    ['Amount',    (p) => String(p.amount ?? '')],
    ['Sent at',   (p) => p.sent_at ?? ''],
    ['Created',   (p) => p.created_at ?? ''],
    ['File URL',  (p) => p.file_url ?? ''],
  ];
  const csvCell = (v: string) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = cols.map((c) => csvCell(c[0])).join(',');
  const body = rows.map((p) => cols.map((c) => csvCell(c[1](p))).join(',')).join('\n');
  const csv = '﻿' + header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `proposals-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
