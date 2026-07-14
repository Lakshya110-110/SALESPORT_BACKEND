'use client';

import Link from 'next/link';
import { useState, useEffect, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Plus, Users, Download } from 'lucide-react';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import { fmtPhone } from '@/lib/utils/format';
import { downloadCsv } from '@/lib/utils/csv';
import { SearchPill } from '@/components/ui/SearchPill';
import { useMasterDataValues } from '@/lib/hooks/useMasterData';
import type { Company } from '@/lib/api/types';

const COMPANY_CSV_COLS: Array<[string, (c: Company) => string]> = [
  ['Name', (c) => c.name],
  ['Industry', (c) => c.industry ?? ''],
  ['City', (c) => c.city ?? ''],
  ['GSTIN', (c) => c.gstin ?? ''],
  ['Phone', (c) => c.phone ?? ''],
  ['Email', (c) => c.email ?? ''],
  ['Contacts', (c) => String(c.contact_count ?? 0)],
];

const INDUSTRIES_FALLBACK = [
  'Dairy', 'FMCG', 'Beverages', 'Agri-inputs', 'Cold chain',
  'Bakery', 'Frozen foods', 'Confectionery', 'Ready-to-eat', 'Nutraceuticals',
];

export default function CompaniesPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const industry = sp.get('industry') ?? '';
  const search = sp.get('search') ?? '';
  const [newOpen, setNewOpen] = useState(false);

  const q = useQuery({
    queryKey: ['companies', 'list', { industry, search }],
    queryFn: () =>
      endpoints.companies.list({
        industry: industry || undefined,
        search: search || undefined,
        page_size: 100,
      }),
  });

  const setParam = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') n.delete(k);
      else n.set(k, v);
    }
    router.push(`/companies${n.toString() ? '?' + n.toString() : ''}`);
  };

  const rows = q.data?.results ?? [];

  // Controlled search text, synced from the URL param; commits on Enter.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);

  return (
    <>
      <SectionHeader
        title="Companies"
        subtitle={`${q.data?.count ?? 0} on file`}
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Download size={14} />}
              onClick={() => downloadCsv('companies.csv', COMPANY_CSV_COLS, rows)}
              disabled={rows.length === 0}
            >
              Export
            </Button>
            <Button leftIcon={<Plus size={15} />} onClick={() => setNewOpen(true)}>
              New company
            </Button>
          </>
        }
      />

      <div className="w-full px-3 pt-3 pb-5 xl:px-4">
        <div className="rounded-card border border-b-subtle bg-surface shadow-sm">
          <div className="sticky top-[76px] z-20 flex items-center gap-2 rounded-t-card border-b border-b-subtle bg-surface p-3">
            <SearchPill
              value={searchInput}
              onChange={setSearchInput}
              onSubmit={(v) => setParam({ search: v || null })}
              placeholder="Search company / GSTIN / city…"
            />
            <IndustryChips value={industry} onPick={(v) => setParam({ industry: v })} />
          </div>

            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-b-default bg-sunken">
                  <Th>Company</Th>
                  <Th>Industry</Th>
                  <Th>City</Th>
                  <Th>GSTIN</Th>
                  <Th className="text-right">Contacts</Th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading ? (
                  <SkelRows n={6} cols={5} />
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-[12.5px] text-subtle">
                      No companies match these filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((c) => <Row key={c.id} c={c} />)
                )}
              </tbody>
            </table>
        </div>
      </div>

      <NewCompanyModal open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}

function Row({ c }: { c: Company }) {
  return (
    <tr className="border-t border-b-subtle hover:bg-soft">
      <Td>
        <Link
          href={`/enquiries?search=${encodeURIComponent(c.name)}`}
          className="flex items-center gap-2"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Building2 size={14} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-text">{c.name}</div>
            <div className="truncate text-[11px] text-subtle">{fmtPhone(c.phone) || '—'}</div>
          </div>
        </Link>
      </Td>
      <Td>{c.industry}</Td>
      <Td>{c.city || '—'}</Td>
      <Td>{c.gstin ? <span className="font-mono">{c.gstin}</span> : '—'}</Td>
      <Td className="text-right">
        <span className="inline-flex items-center gap-1 rounded-sm bg-soft px-1.5 py-0.5 font-mono text-[11px] text-muted">
          <Users size={10} />
          {c.contact_count}
        </span>
      </Td>
    </tr>
  );
}

function IndustryChips({
  value,
  onPick,
}: {
  value: string;
  onPick: (v: string | null) => void;
}) {
  const industries = useMasterDataValues('industry', INDUSTRIES_FALLBACK);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sp-scroll">
      <ChipBtn active={!value} onClick={() => onPick(null)}>All</ChipBtn>
      {industries.map((i) => (
        <ChipBtn key={i} active={value === i} onClick={() => onPick(value === i ? null : i)}>
          {i}
        </ChipBtn>
      ))}
    </div>
  );
}

function ChipBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
        active ? 'bg-primary-soft text-primary' : 'bg-soft text-muted hover:bg-sunken',
      )}
    >
      {children}
    </button>
  );
}

function NewCompanyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const industries = useMasterDataValues('industry', INDUSTRIES_FALLBACK);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('Dairy');
  const [gstin, setGstin] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const qc = useQueryClient();
  const reset = () => {
    setName(''); setIndustry('Dairy'); setGstin(''); setPhone(''); setCity('');
  };
  const submit = useMutation({
    mutationFn: () =>
      endpoints.companies.create({
        name: name.trim(),
        industry,
        gstin: gstin.trim(),
        phone: phone.trim(),
        city: city.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      reset();
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="New company"
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            type="submit"
            form="new-co-form"
            loading={submit.isPending}
            disabled={!name.trim()}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="new-co-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          submit.mutate();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Company name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Industry" required>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputCls}>
              {industries.map((i) => <option key={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="GSTIN">
            <input value={gstin} onChange={(e) => setGstin(e.target.value)} className={inputCls} placeholder="09ABCDE1234F1Z5" />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="9876543210" />
          </Field>
          <Field label="City">
            <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="Lucknow" />
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
        'sticky top-[141px] z-10 bg-sunken px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-subtle',
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

function SkelRows({ n, cols }: { n: number; cols: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <tr key={i} className="border-t border-b-subtle">
          <td colSpan={cols} className="px-4 py-3">
            <div className="h-4 animate-pulse rounded bg-soft" />
          </td>
        </tr>
      ))}
    </>
  );
}
