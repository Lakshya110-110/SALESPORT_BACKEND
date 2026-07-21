'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, MessageSquare } from 'lucide-react';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import type { SmsTemplate } from '@/lib/api/types';

/**
 * SMS Templates — the library a consultant picks from in an enquiry's SMS tab.
 *
 * Every row is a DLT-approved message: the `body` is text registered with the
 * operator, and `dlt_template_id` is that registration. India's DLT regime
 * rejects anything that doesn't byte-match, which is why the messages live here
 * as a managed list rather than being typed free-hand at send time.
 */
const PLACEHOLDERS = ['{name}', '{company}', '{lead_id}', '{consultant}'];

export default function SmsTemplatesPage() {
  const [editing, setEditing] = useState<SmsTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SmsTemplate | null>(null);

  const q = useQuery({
    queryKey: ['sms-templates'],
    queryFn: () => endpoints.smsTemplates.list(),
  });
  const templates = q.data?.results ?? [];

  return (
    <>
      <SectionHeader
        title="SMS Templates"
        subtitle="Approved messages consultants can send to leads."
        actions={
          <Button leftIcon={<Plus size={15} />} onClick={() => setCreating(true)}>
            New template
          </Button>
        }
      />

      <div className="w-full px-3 pt-3 pb-5 xl:px-4">
        {/* Why a managed list and not a text box — stated once, where it's added. */}
        <div className="mb-[14px] flex items-start gap-[9px] rounded-md bg-warning-soft p-[10px_12px] text-[12px] leading-[1.5] text-muted">
          <MessageSquare size={15} className="mt-[1px] shrink-0 text-warning" />
          <span>
            Each template must be registered with your DLT operator before it can send — the operator
            drops any SMS whose text doesn&rsquo;t match a registration. Put the approved wording in{' '}
            <b className="text-text">Message</b> and its registration in <b className="text-text">DLT template ID</b>.
            Use {PLACEHOLDERS.join(', ')} for the parts that vary per lead.
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-b-subtle bg-surface shadow-card">
          <div className="sp-scroll overflow-auto">
            <table className="w-full min-w-0 text-[12.5px] md:min-w-[640px]">
              <thead>
                <tr className="border-b border-b-default bg-sunken">
                  <Th>Name</Th>
                  <Th>Message</Th>
                  <Th className="hidden md:table-cell">DLT ID</Th>
                  <Th className="w-[84px] text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-t border-b-subtle">
                      <td colSpan={4} className="px-4 py-3">
                        <div className="sp-skeleton h-4 w-2/3" />
                      </td>
                    </tr>
                  ))
                ) : templates.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        icon={MessageSquare}
                        title="No templates yet"
                        message="Add a DLT-approved message and it becomes selectable in every enquiry's SMS tab."
                      />
                    </td>
                  </tr>
                ) : (
                  templates.map((t) => (
                    <tr key={t.id} className="border-t border-b-subtle hover:bg-soft">
                      <Td className="font-semibold text-text">{t.name}</Td>
                      <Td>
                        <span className="whitespace-pre-line break-words text-muted">{t.body}</span>
                      </Td>
                      <Td className="hidden md:table-cell">
                        <span className="font-mono tabular-nums text-[11px] text-subtle">
                          {t.dlt_template_id || '—'}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(t)}
                            aria-label={`Edit ${t.name}`}
                            title="Edit"
                            className="rounded-md p-1 text-subtle hover:bg-soft hover:text-text"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(t)}
                            aria-label={`Delete ${t.name}`}
                            title="Delete"
                            className="rounded-md p-1 text-subtle hover:bg-danger-soft hover:text-danger"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <TemplateModal open={creating} onClose={() => setCreating(false)} />
      <TemplateModal open={Boolean(editing)} onClose={() => setEditing(null)} template={editing} />
      {deleting && (
        <DeleteTemplateModal t={deleting} open={Boolean(deleting)} onClose={() => setDeleting(null)} />
      )}
    </>
  );
}

/** Create + edit share one modal; `template` switches to edit mode. */
function TemplateModal({
  open,
  onClose,
  template = null,
}: {
  open: boolean;
  onClose: () => void;
  template?: SmsTemplate | null;
}) {
  const qc = useQueryClient();
  const isEdit = Boolean(template);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [dlt, setDlt] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setBody(template?.body ?? '');
    setDlt(template?.dlt_template_id ?? '');
  }, [open, template?.id, template?.name, template?.body, template?.dlt_template_id]);

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), body: body.trim(), dlt_template_id: dlt.trim() };
      return isEdit && template
        ? endpoints.smsTemplates.patch(template.id, payload)
        : endpoints.smsTemplates.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sms-templates'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${template?.name ?? 'template'}` : 'New SMS template'}
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            loading={save.isPending}
            disabled={!name.trim() || !body.trim()}
            onClick={() => save.mutate()}
          >
            {isEdit ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" hint="What the consultant sees in the picker" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Follow-up" />
        </Field>
        <Field label="Message" hint={`Use ${PLACEHOLDERS.join(', ')} for the per-lead blanks`} required>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className={cn(inputCls, 'h-auto py-2 leading-relaxed')}
            placeholder="Hi {name}, following up on your enquiry {lead_id}. - {consultant}, Sort String"
          />
        </Field>
        <Field label="DLT template ID" hint="The registration this message maps to. Leave blank only in dev.">
          <input value={dlt} onChange={(e) => setDlt(e.target.value)} className={cn(inputCls, 'font-mono')} placeholder="1234567890123456789" />
        </Field>
        {save.error && (
          <div className="rounded-md bg-danger-soft p-2 text-[12px] text-danger">
            {(save.error as Error).message}
          </div>
        )}
      </div>
    </Modal>
  );
}

function DeleteTemplateModal({
  t,
  open,
  onClose,
}: {
  t: SmsTemplate;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => endpoints.smsTemplates.remove(t.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sms-templates'] });
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete template"
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            Delete
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-[13px] text-text">
        <p>Delete <span className="font-semibold">{t.name}</span>?</p>
        <p className="text-[12px] text-subtle">
          It disappears from every enquiry&rsquo;s SMS picker. Messages already sent are kept.
        </p>
        {remove.error && (
          <div className="rounded-md bg-danger-soft p-2 text-[12px] text-danger">
            {(remove.error as Error).message}
          </div>
        )}
      </div>
    </Modal>
  );
}

const inputCls = cn(
  'h-10 w-full rounded-md border border-b-default bg-surface px-3 text-[13px] text-text placeholder:text-subtle',
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft',
);

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-subtle">{hint}</span>}
    </label>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-subtle', className)}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-2.5 align-top', className)}>{children}</td>;
}
