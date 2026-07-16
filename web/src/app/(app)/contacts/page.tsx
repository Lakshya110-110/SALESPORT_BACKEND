'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, Plus, Mail, Phone, Star, Download } from 'lucide-react';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { endpoints } from '@/lib/api/endpoints';
import { phoneError } from '@/lib/utils/phone';
import { cn } from '@/lib/utils/cn';
import { fmtPhone } from '@/lib/utils/format';
import { downloadCsv } from '@/lib/utils/csv';
import { SearchPill } from '@/components/ui/SearchPill';
import { SortableTh } from '@/components/ui/SortableTh';
import { useTableSort } from '@/lib/hooks/useTableSort';
import type { Company, Contact } from '@/lib/api/types';

const CONTACT_SORT = {
  name: (c: Contact) => c.name?.toLowerCase(),
  company: (c: Contact) => c.company_name?.toLowerCase(),
  designation: (c: Contact) => c.designation?.toLowerCase(),
  phone: (c: Contact) => c.phone,
  email: (c: Contact) => c.email?.toLowerCase(),
  primary: (c: Contact) => (c.is_primary ? 1 : 0),
};

const CONTACT_CSV_COLS: Array<[string, (c: Contact) => string]> = [
  ['Name', (c) => c.name],
  ['Company', (c) => c.company_name ?? ''],
  ['Designation', (c) => c.designation ?? ''],
  ['Phone', (c) => c.phone ?? ''],
  ['Email', (c) => c.email ?? ''],
  ['Primary', (c) => (c.is_primary ? 'Yes' : 'No')],
];

export default function ContactsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const search = sp.get('search') ?? '';
  const [newOpen, setNewOpen] = useState(false);

  const q = useQuery({
    queryKey: ['contacts', 'list', { search }],
    queryFn: () => endpoints.contacts.list({ search: search || undefined, page_size: 100 }),
  });

  const setSearch = (v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set('search', v); else n.delete('search');
    router.push(`/contacts${n.toString() ? '?' + n.toString() : ''}`);
  };

  const rows = q.data?.results ?? [];

  // Controlled search text, synced from the URL param; commits on Enter.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);

  const { sorted, activeKey, dir, onSort } = useTableSort(rows, CONTACT_SORT);

  return (
    <>
      <SectionHeader
        title="Contacts"
        subtitle={`${q.data?.count ?? 0} people on file`}
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Download size={14} />}
              onClick={() => downloadCsv('contacts.csv', CONTACT_CSV_COLS, rows)}
              disabled={rows.length === 0}
            >
              Export
            </Button>
            <Button leftIcon={<Plus size={15} />} onClick={() => setNewOpen(true)}>
              New contact
            </Button>
          </>
        }
      />
      <div className="w-full px-3 pt-3 pb-5 xl:px-4">
        <div className="rounded-card border border-b-subtle bg-surface shadow-sm">
          <div className="flex items-center gap-2 border-b border-b-subtle p-3">
            <SearchPill
              value={searchInput}
              onChange={setSearchInput}
              onSubmit={setSearch}
              placeholder="Search name / phone / email / company…"
            />
          </div>

          <div className="sp-scroll overflow-auto" style={{ maxHeight: 'calc(100dvh - 190px)' }}>
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-b-default bg-sunken">
                  <SortableTh label="Name" sortKey="name" activeKey={activeKey} dir={dir} onSort={onSort} />
                  <SortableTh label="Company" sortKey="company" activeKey={activeKey} dir={dir} onSort={onSort} />
                  <SortableTh label="Designation" sortKey="designation" activeKey={activeKey} dir={dir} onSort={onSort} />
                  <SortableTh label="Phone" sortKey="phone" activeKey={activeKey} dir={dir} onSort={onSort} />
                  <SortableTh label="Email" sortKey="email" activeKey={activeKey} dir={dir} onSort={onSort} />
                  <SortableTh label="Primary" sortKey="primary" activeKey={activeKey} dir={dir} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {q.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-b-subtle">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="h-4 sp-skeleton" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-[12.5px] text-subtle">
                      No contacts match this search.
                    </td>
                  </tr>
                ) : (
                  sorted.map((c) => <Row key={c.id} c={c} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <NewContactModal open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}

function Row({ c }: { c: Contact }) {
  return (
    <tr className="border-t border-b-subtle hover:bg-soft">
      <Td>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <User size={14} />
          </div>
          <span className="font-semibold text-text">{c.name}</span>
        </div>
      </Td>
      <Td>{c.company_name}</Td>
      <Td>{c.designation || '—'}</Td>
      <Td>
        {c.phone ? (
          <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 font-mono tabular-nums text-primary hover:underline">
            <Phone size={11} /> {fmtPhone(c.phone)}
          </a>
        ) : '—'}
      </Td>
      <Td>
        {c.email ? (
          <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
            <Mail size={11} /> {c.email}
          </a>
        ) : '—'}
      </Td>
      <Td>
        {c.is_primary && (
          <span className="inline-flex items-center gap-1 rounded-sm bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-warning">
            <Star size={10} /> Primary
          </span>
        )}
      </Td>
    </tr>
  );
}

function NewContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyQ, setCompanyQ] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const qc = useQueryClient();

  const companiesQ = useQuery({
    queryKey: ['companies', 'search-contact', companyQ],
    queryFn: () => endpoints.companies.list({ search: companyQ, page_size: 6 }),
    enabled: open && companyQ.trim().length >= 2,
  });

  const reset = () => {
    setName(''); setCompanyId(null); setCompanyQ(''); setDesignation('');
    setPhone(''); setEmail(''); setIsPrimary(false);
  };

  const submit = useMutation({
    mutationFn: () => {
      if (!companyId) throw new Error('Pick a company.');
      return endpoints.contacts.create({
        company: companyId,
        name: name.trim(),
        designation: designation.trim(),
        phone: phone.trim(),
        email: email.trim(),
        is_primary: isPrimary,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      reset();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="New contact"
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            type="submit"
            form="new-contact-form"
            loading={submit.isPending}
            disabled={!name.trim() || !companyId || phoneError(phone) !== null}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="new-contact-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <Field label="Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Company" required>
          <div className="relative">
            <input
              value={companyQ}
              onChange={(e) => { setCompanyQ(e.target.value); setCompanyId(null); }}
              placeholder="Type to search…"
              className={inputCls}
            />
            {companyQ.length >= 2 && (companiesQ.data?.results ?? []).length > 0 && !companyId && (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-md border border-b-subtle bg-surface shadow-md">
                {(companiesQ.data?.results ?? []).map((c: Company) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setCompanyId(c.id); setCompanyQ(c.name); }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] hover:bg-soft"
                  >
                    <span className="truncate text-text">{c.name}</span>
                    <span className="text-[11px] text-subtle">{c.industry}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Designation">
            <input value={designation} onChange={(e) => setDesignation(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Phone">
            {/* Optional here — blank is fine, wrong is not. */}
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            {phoneError(phone) && (
              <span className="mt-1 block text-[11px] text-danger">{phoneError(phone)}</span>
            )}
          </Field>
          <Field label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} />
          </Field>
          <Field label="Primary contact">
            <label className="mt-1 inline-flex items-center gap-2 text-[13px] text-text">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-b-default text-primary focus:ring-primary-soft"
              />
              Mark as primary for this company
            </label>
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
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
