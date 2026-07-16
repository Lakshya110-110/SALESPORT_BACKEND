'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Download } from 'lucide-react';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { endpoints } from '@/lib/api/endpoints';
import { session } from '@/lib/auth/session';
import { cn } from '@/lib/utils/cn';
import { downloadCsv } from '@/lib/utils/csv';
import { SortableTh } from '@/components/ui/SortableTh';
import { useTableSort } from '@/lib/hooks/useTableSort';
import type { MasterDataItem } from '@/lib/api/types';

const MD_SORT = {
  value: (m: MasterDataItem) => m.value?.toLowerCase(),
  label: (m: MasterDataItem) => m.label?.toLowerCase(),
  order: (m: MasterDataItem) => m.order ?? 0,
};

const MD_CSV_COLS: Array<[string, (m: MasterDataItem) => string]> = [
  ['Category', (m) => m.category],
  ['Value', (m) => m.value],
  ['Label', (m) => m.label ?? ''],
  ['Order', (m) => String(m.order ?? '')],
  ['Active', (m) => (m.is_active ? 'Yes' : 'No')],
];

const CATEGORIES: Array<{ key: MasterDataItem['category']; label: string }> = [
  { key: 'industry', label: 'Industries' },
  { key: 'source', label: 'Enquiry sources' },
  { key: 'status', label: 'Statuses' },
  { key: 'enquiry_type', label: 'Enquiry types' },
  { key: 'mode', label: 'Meeting modes' },
];

/**
 * Master Data — /master-data.
 *
 * Category tabs (industry / source / status / enquiry_type / mode). Each tab
 * lists the entries in `?order` order with an inline "Add entry" input. Admin
 * only writes (server enforces via IsAdminRole). Consultants see read-only.
 */
export default function MasterDataPage() {
  const user = session.getUser();
  const isAdmin = user?.role === 'admin';
  const [category, setCategory] = useState<MasterDataItem['category']>('industry');
  const [addOpen, setAddOpen] = useState(false);

  // Same query key as CategoryTable — react-query dedupes, so this reuses the
  // already-fetched entries for the current category to feed the Export button.
  const exportQ = useQuery({
    queryKey: ['master-data', category],
    queryFn: () => endpoints.masterData(category),
  });
  const exportRows = exportQ.data?.results ?? [];

  return (
    <>
      <SectionHeader
        title="Master data"
        subtitle="Dropdowns and tags used across the app."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Download size={14} />}
              onClick={() => downloadCsv(`master-data-${category}.csv`, MD_CSV_COLS, exportRows)}
              disabled={exportRows.length === 0}
            >
              Export
            </Button>
            {isAdmin && (
              <Button leftIcon={<Plus size={15} />} onClick={() => setAddOpen(true)}>
                Add entry
              </Button>
            )}
          </>
        }
      />
      <div className="w-full px-3 pt-3 pb-5 xl:px-4">
        <div className="rounded-card border border-b-subtle bg-surface shadow-sm">
          <div className="flex flex-wrap items-center gap-1 border-b border-b-subtle p-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[12.5px] font-semibold',
                  category === c.key ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-soft',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <CategoryTable category={category} canEdit={isAdmin} />
        </div>
      </div>

      {isAdmin && (
        <AddModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          category={category}
        />
      )}
    </>
  );
}

function CategoryTable({
  category,
  canEdit,
}: {
  category: MasterDataItem['category'];
  canEdit: boolean;
}) {
  const q = useQuery({
    queryKey: ['master-data', category],
    queryFn: () => endpoints.masterData(category),
  });
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: (id: number) => endpoints.masterDataWrite.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master-data', category] });
      // Broader prefix — also refreshes useMasterDataValues' cache
      // (['master-data','values',category]) so every picker that reads
      // from it drops the deleted entry immediately, not just this table.
      qc.invalidateQueries({ queryKey: ['master-data'] });
    },
  });

  const rows = q.data?.results ?? [];
  const { sorted, activeKey, dir, onSort } = useTableSort(rows, MD_SORT);

  return (
    <div className="sp-scroll overflow-auto" style={{ maxHeight: 'calc(100dvh - 175px)' }}>
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="border-b border-b-default bg-sunken">
          <SortableTh label="Value" sortKey="value" activeKey={activeKey} dir={dir} onSort={onSort} />
          <SortableTh label="Label" sortKey="label" activeKey={activeKey} dir={dir} onSort={onSort} />
          <SortableTh label="Order" sortKey="order" align="right" activeKey={activeKey} dir={dir} onSort={onSort} />
          {canEdit && <Th />}
        </tr>
      </thead>
      <tbody>
        {q.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <tr key={i} className="border-t border-b-subtle">
              <td colSpan={canEdit ? 4 : 3} className="px-4 py-3">
                <div className="h-4 sp-skeleton" />
              </td>
            </tr>
          ))
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={canEdit ? 4 : 3} className="p-10 text-center text-[12.5px] text-subtle">
              No entries in this category yet.
            </td>
          </tr>
        ) : (
          sorted.map((m) => (
            <tr key={m.id} className="border-t border-b-subtle hover:bg-soft">
              <Td><span className="font-mono">{m.value}</span></Td>
              <Td>{m.label}</Td>
              <Td className="text-right font-mono tabular-nums text-subtle">{m.order}</Td>
              {canEdit && (
                <Td className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove "${m.label}"?`)) del.mutate(m.id);
                    }}
                    aria-label="Delete"
                    className="rounded-md p-1 text-subtle hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </Td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
    </div>
  );
}

function AddModal({
  open,
  onClose,
  category,
}: {
  open: boolean;
  onClose: () => void;
  category: MasterDataItem['category'];
}) {
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [order, setOrder] = useState('0');
  const qc = useQueryClient();

  const reset = () => {
    setValue(''); setLabel(''); setOrder('0');
  };

  const submit = useMutation({
    mutationFn: () =>
      endpoints.masterDataWrite.create({
        category,
        value: value.trim(),
        label: (label.trim() || value.trim()),
        order: Number(order) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master-data', category] });
      qc.invalidateQueries({ queryKey: ['master-data'] });
      reset();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={`Add ${category.replace('_', ' ')}`}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            type="submit"
            form="md-add-form"
            loading={submit.isPending}
            disabled={!value.trim()}
          >
            Add
          </Button>
        </>
      }
    >
      <form
        id="md-add-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-3"
      >
        <Field label="Value (used by API)" required>
          <input value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} placeholder="e.g. Retail" />
        </Field>
        <Field label="Label (shown to users)">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="Defaults to value" />
        </Field>
        <Field label="Order">
          <input value={order} onChange={(e) => setOrder(e.target.value.replace(/[^0-9]/g, ''))} className={inputCls} inputMode="numeric" />
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

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
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
