'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import { ddmmToISO } from '@/lib/utils/date';
import { VALUE_BANDS, bandById } from '@/lib/utils/valueBand';
import { useMasterDataValues } from '@/lib/hooks/useMasterData';
import type { Company, EnquiryDetail } from '@/lib/api/types';

/**
 * New Enquiry — modal (matches uploaded HTML `#newEnquiryModal`).
 *
 * Two-column form. Fields, order, and copy come from the mockup:
 *   Company · Contact person · Phone · Email · GSTIN · Industry ·
 *   Enquiry source · Enquiry type · Expected value · Expected close date
 * Hint under the fields: "Phone number is the unique identifier".
 *
 * Wire:
 *   1. Company find-or-create by exact-name match on `?search=`.
 *   2. Optional Contact create against the resolved company.
 *   3. `POST /enquiries/` with everything else.
 *   4. On success, route to `/enquiries/{id}` and refetch dashboard + list.
 */

const INDUSTRIES_FALLBACK = [
  'Dairy', 'FMCG', 'Beverages', 'Agri-inputs', 'Cold chain',
  'Bakery', 'Frozen foods', 'Confectionery', 'Ready-to-eat', 'Nutraceuticals',
];
const SOURCES_FALLBACK = ['Referral', 'Website', 'Cold call', 'Exhibition', 'Partner'];

type State = {
  company: string;
  contact: string;
  phone: string;
  email: string;
  industry: string;
  source: string;
  expectedBand: string;
  expectedCloseDate: string;
};

const initial: State = {
  company: '',
  contact: '',
  phone: '+91 ',
  email: '',
  industry: 'Dairy',
  source: 'Referral',
  expectedBand: '',
  expectedCloseDate: '',
};

export function NewEnquiryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = useState<State>(initial);
  const [error, setError] = useState<string | null>(null);
  const industries = useMasterDataValues('industry', INDUSTRIES_FALLBACK);
  const sources = useMasterDataValues('source', SOURCES_FALLBACK);

  const set = (k: keyof State, v: string) => setF((s) => ({ ...s, [k]: v }));

  // `f.phone` always renders as "+91 …" (see formatPhone) even with zero
  // digits typed, so `f.phone.trim()` is always truthy and can't gate
  // submission on its own — count the actual subscriber digits instead.
  const phoneDigits = (f.phone.startsWith('+91') ? f.phone.slice(3) : f.phone).replace(/\D/g, '');
  const phoneValid = phoneDigits.length === 10;

  // Email was gated on "not empty" alone, so "abc" reached the API. Require a
  // local part, an @, and a dotted domain — deliberately permissive about the
  // exotic-but-legal (quoted local parts, new TLDs) and strict about the shape
  // people actually get wrong.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());

  // Live company suggestions (like the mockup's `neCo` autocomplete).
  const companyQ = useQuery({
    queryKey: ['companies', 'newenq', f.company],
    queryFn: () => endpoints.companies.list({ search: f.company, page_size: 6 }),
    enabled: open && f.company.trim().length >= 2,
  });

  const submit = useMutation({
    mutationFn: async (): Promise<EnquiryDetail> => {
      const name = f.company.trim();
      if (!name) throw new Error('Company is required.');

      const found = await endpoints.companies.list({ search: name, page_size: 20 });
      let company: Company | undefined = (found.results ?? []).find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      );
      if (!company) {
        company = await endpoints.companies.create({
          name,
          industry: f.industry,
          phone: f.phone.replace(/\D/g, '').slice(-10),
        });
      }

      let contactId: number | undefined;
      if (f.contact.trim()) {
        const c = await endpoints.contacts.create({
          company: company.id,
          name: f.contact.trim(),
          phone: f.phone.replace(/\D/g, '').slice(-10),
          email: f.email.trim(),
          is_primary: true,
        });
        contactId = c.id;
      }

      const body: Record<string, unknown> = {
        company: company.id,
        contact: contactId ?? null,
        phone: f.phone.replace(/\D/g, '').slice(-10),
        email: f.email.trim(),
        source: f.source,
        status: 'New',
        industry: f.industry,
        // Store the picked band's midpoint. 0 when nothing was picked — that
        // reads as "no figure entered" everywhere (a dash, not a band).
        expected_value: bandById(f.expectedBand)?.mid ?? 0,
        expected_close_date: ddmmToISO(f.expectedCloseDate),
        description: '',
      };
      return endpoints.enquiries.create(body as never);
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setF(initial);
      onClose();
      router.push(`/enquiries/${created.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    submit.mutate();
  };

  const suggestions = (companyQ.data?.results ?? []).filter(
    (c) => c.name.toLowerCase() !== f.company.toLowerCase(),
  );

  return (
    <Modal
      open={open}
      onClose={() => { setF(initial); setError(null); onClose(); }}
      title="New Enquiry"
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => { setF(initial); setError(null); onClose(); }}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-enq-form"
            loading={submit.isPending}
            disabled={!f.company.trim() || !f.contact.trim() || !phoneValid || !emailValid}
          >
            Create Enquiry
          </Button>
        </>
      }
    >
      <form id="new-enq-form" onSubmit={onSubmit} className="space-y-2">
        <div className="grid grid-cols-1 gap-x-[22px] gap-y-[3px] md:grid-cols-2">
          <Field label="Company" required>
            <div className="relative">
              <input
                value={f.company}
                onChange={(e) => set('company', e.target.value)}
                placeholder="Start typing company name…"
                className={inputCls}
                autoComplete="off"
              />
              {f.company.trim().length >= 2 && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-lg border border-b-subtle bg-surface shadow-pop">
                  {suggestions.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          set('company', c.name);
                          set('industry', c.industry);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] hover:bg-soft"
                      >
                        <span className="truncate text-text">{c.name}</span>
                        <span className="ml-2 shrink-0 text-[11px] text-subtle">{c.industry}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
          <Field label="Contact person" required>
            <input
              value={f.contact}
              onChange={(e) => set('contact', e.target.value)}
              placeholder="Full name"
              className={inputCls}
            />
          </Field>
          <Field label="Phone number" required>
            <input
              value={f.phone}
              onChange={(e) => set('phone', formatPhone(e.target.value))}
              type="tel"
              placeholder="98765 43210"
              className={inputCls}
            />
            {phoneDigits.length > 0 && !phoneValid && (
              <span className="mt-1 block text-[11px] text-danger">
                Enter a full 10-digit mobile number.
              </span>
            )}
          </Field>
          <Field label="Email" required>
            <input
              value={f.email}
              onChange={(e) => set('email', e.target.value)}
              type="email"
              placeholder="name@company.com"
              className={inputCls}
            />
            {f.email.trim().length > 0 && !emailValid && (
              <span className="mt-1 block text-[11px] text-danger">
                Enter a valid email address — it needs an @ and a domain.
              </span>
            )}
          </Field>
          <Field label="Industry">
            <select value={f.industry} onChange={(e) => set('industry', e.target.value)} className={inputCls}>
              {industries.map((i) => <option key={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Enquiry source">
            <select value={f.source} onChange={(e) => set('source', e.target.value)} className={inputCls}>
              {sources.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Expected deal value">
            {/* A range, not a figure — nobody knows the exact number this early.
                The band's midpoint is what gets stored, because the dashboard
                still has to Sum() a real number for pipeline value. */}
            <select
              value={f.expectedBand}
              onChange={(e) => set('expectedBand', e.target.value)}
              className={inputCls}
            >
              <option value="">Select a range…</option>
              {VALUE_BANDS.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Expected close date">
            <DateField
              value={f.expectedCloseDate}
              onChange={(v) => set('expectedCloseDate', v)}
              minDate={new Date()}
            />
          </Field>
        </div>

        <div className="mt-2 flex items-center gap-2 rounded-md bg-soft px-3 py-2 text-[11.5px] text-muted">
          <Info size={13} className="shrink-0 text-subtle" />
          Phone number is the unique identifier — one contact per number.
        </div>

        {error && (
          <div className="mt-2 rounded-md bg-danger-soft p-2 text-[12px] text-danger">{error}</div>
        )}
      </form>
    </Modal>
  );
}

// ---------- primitives ----------

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
    <label className="mb-[19px] block">
      <span className="mb-[7px] block text-[11.5px] font-semibold text-muted">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}

function formatPhone(v: string): string {
  // Strip the rendered "+91 " prefix BEFORE extracting digits — otherwise
  // the country code merges into the subscriber number on every keystroke
  // (typing "9" became "+91 919"). Also tolerate pasted numbers that carry
  // their own country code or leading zeros.
  const raw = v.startsWith('+91') ? v.slice(3) : v;
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length > 10) digits = digits.replace(/^0+/, '');
  digits = digits.slice(0, 10);
  if (digits.length <= 5) return '+91 ' + digits;
  return '+91 ' + digits.slice(0, 5) + ' ' + digits.slice(5);
}
