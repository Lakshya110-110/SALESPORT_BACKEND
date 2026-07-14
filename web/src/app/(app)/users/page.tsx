'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ShieldCheck, Trash2, User as UserIcon, Download } from 'lucide-react';
import { SearchPill } from '@/components/ui/SearchPill';
import { SortableTh } from '@/components/ui/SortableTh';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { endpoints } from '@/lib/api/endpoints';
import { session } from '@/lib/auth/session';
import { avatarColor, initials, fmtPhone } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { downloadCsv } from '@/lib/utils/csv';
import type { Paginated, User } from '@/lib/api/types';

/**
 * Users — /users.
 *
 * Admin-only writes (server enforces via `IsAdminRole`). Consultants land
 * here they'll see the list read-only (Add and toggles hidden). The Rail
 * only shows this link for admins today; this component still checks
 * server-side by omitting write UI when `session.user.role !== 'admin'`.
 */
export default function UsersPage() {
  const currentUser = session.getUser();
  const isAdmin = currentUser?.role === 'admin';
  const [newOpen, setNewOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['users', 'list'],
    queryFn: () => endpoints.users.list({ page_size: 100 }),
  });

  const [toggleError, setToggleError] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      endpoints.users.patch(id, { is_active }),
    // Flip the switch immediately (optimistic), then reconcile with the server.
    // Without this the knob only moves after a full PATCH+refetch round-trip,
    // so it feels unresponsive / "stuck". On failure we roll back and show why.
    onMutate: async ({ id, is_active }) => {
      setToggleError(null);
      await qc.cancelQueries({ queryKey: ['users', 'list'] });
      const prev = qc.getQueryData<Paginated<User>>(['users', 'list']);
      qc.setQueryData<Paginated<User>>(['users', 'list'], (old) =>
        old
          ? { ...old, results: old.results.map((u) => (u.id === id ? { ...u, is_active } : u)) }
          : old,
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['users', 'list'], ctx.prev);
      setToggleError(err instanceof Error ? err.message : 'Could not update the user. Please try again.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const rows = q.data?.results ?? [];

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | User['role']>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'active' | 'inactive'>('');
  const term = search.trim().toLowerCase();
  const filtered = rows.filter((u) => {
    const matchesSearch =
      !term ||
      u.name.toLowerCase().includes(term) ||
      u.phone.includes(term) ||
      (u.email ?? '').toLowerCase().includes(term);
    const matchesRole = !roleFilter || u.role === roleFilter;
    const matchesActive = !activeFilter || (activeFilter === 'active' ? u.is_active : !u.is_active);
    return matchesSearch && matchesRole && matchesActive;
  });

  const { sorted, activeKey, dir, onSort } = useTableSort(filtered, USER_SORT);

  return (
    <>
      <SectionHeader
        title="Users"
        subtitle={`${q.data?.count ?? 0} on the team`}
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Download size={14} />}
              onClick={() => downloadCsv('users.csv', USER_CSV_COLS, filtered)}
              disabled={filtered.length === 0}
            >
              Export
            </Button>
            {isAdmin && (
              <Button leftIcon={<Plus size={15} />} onClick={() => setNewOpen(true)}>
                Add user
              </Button>
            )}
          </>
        }
      />

      <div className="w-full px-3 pt-3 pb-5 xl:px-4">
        {toggleError && (
          <div className="mb-3 rounded-md bg-danger-soft p-2 text-[12px] text-danger">
            {toggleError}
          </div>
        )}
        <div className="rounded-card border border-b-subtle bg-surface shadow-sm">
          {/* Search + filters — above the internally-scrolling table (Enquiries pattern). */}
          <div className="flex items-center gap-2 border-b border-b-subtle p-3">
            <SearchPill value={search} onChange={setSearch} placeholder="Search name / phone / email…" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as '' | User['role'])}
              className="h-9 shrink-0 rounded-md border border-b-subtle bg-soft px-2 text-[12.5px] font-medium text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
            >
              <option value="">All roles</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as '' | 'active' | 'inactive')}
              className="h-9 shrink-0 rounded-md border border-b-subtle bg-soft px-2 text-[12.5px] font-medium text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <span className="shrink-0 text-[11.5px] text-subtle">{filtered.length} of {rows.length}</span>
          </div>
          <div className="sp-scroll overflow-auto" style={{ maxHeight: 'calc(100dvh - 190px)' }}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-b-default bg-sunken">
                <SortableTh label="Name" sortKey="name" activeKey={activeKey} dir={dir} onSort={onSort} />
                <SortableTh label="Phone" sortKey="phone" activeKey={activeKey} dir={dir} onSort={onSort} />
                <SortableTh label="Email" sortKey="email" activeKey={activeKey} dir={dir} onSort={onSort} />
                <SortableTh label="Role" sortKey="role" activeKey={activeKey} dir={dir} onSort={onSort} />
                <Th>Actions</Th>
                <SortableTh label="Active" sortKey="active" align="right" activeKey={activeKey} dir={dir} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-b-subtle">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-soft" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-[12.5px] text-subtle">
                    {rows.length === 0 ? 'No users yet.' : 'No users match your search or filters.'}
                  </td>
                </tr>
              ) : (
                sorted.map((u) => (
                  <tr key={u.id} className="border-t border-b-subtle hover:bg-soft">
                    <Td>
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: u.avatar_color || avatarColor(u.name) }}
                        >
                          {u.initials || initials(u.name)}
                        </div>
                        <span className="font-semibold text-text">{u.name}</span>
                      </div>
                    </Td>
                    <Td><span className="font-mono">{fmtPhone(u.phone)}</span></Td>
                    <Td>{u.email || '—'}</Td>
                    <Td>
                      <RoleBadge role={u.role} />
                    </Td>
                    <Td>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditUser(u)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-subtle hover:bg-soft hover:text-primary"
                            aria-label={`Edit ${u.name}`}
                            title="Edit user"
                          >
                            <Pencil size={16} />
                          </button>
                          {u.id !== currentUser?.id && (
                            <button
                              type="button"
                              onClick={() => setDeleteUser(u)}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-subtle hover:bg-danger-soft hover:text-danger"
                              aria-label={`Delete ${u.name}`}
                              title="Delete user"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right">
                      {isAdmin ? (
                        <div title={u.id === currentUser?.id ? 'You cannot deactivate your own admin account' : undefined}>
                          <Switch
                            checked={u.is_active}
                            onChange={(next) => toggle.mutate({ id: u.id, is_active: next })}
                            disabled={u.id === currentUser?.id}
                            ariaLabel={u.is_active ? 'Deactivate user' : 'Activate user'}
                          />
                        </div>
                      ) : (
                        <span className={cn('text-[11px] font-semibold', u.is_active ? 'text-success' : 'text-subtle')}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {isAdmin && <NewUserModal open={newOpen} onClose={() => setNewOpen(false)} />}
      {isAdmin && editUser && (
        <EditUserModal user={editUser} open={!!editUser} onClose={() => setEditUser(null)} />
      )}
      {isAdmin && deleteUser && (
        <DeleteUserModal user={deleteUser} open={!!deleteUser} onClose={() => setDeleteUser(null)} />
      )}
    </>
  );
}

// Roles must match the backend User.ROLE_CHOICES wire values exactly. Order is
// field-role → management → admin. Labels are the human-readable display text.
const ROLE_OPTIONS = ['consultant', 'sales_head', 'manager', 'founder', 'admin'] as const;
const ROLE_LABELS: Record<User['role'], string> = {
  consultant: 'Consultant',
  sales_head: 'Sales Head',
  manager: 'Manager',
  founder: 'Founder',
  admin: 'Admin',
};

const USER_CSV_COLS: Array<[string, (u: User) => string]> = [
  ['Name', (u) => u.name],
  ['Phone', (u) => u.phone],
  ['Email', (u) => u.email ?? ''],
  ['Role', (u) => ROLE_LABELS[u.role] ?? u.role],
  ['Active', (u) => (u.is_active ? 'Yes' : 'No')],
];

const USER_SORT = {
  name: (u: User) => u.name?.toLowerCase(),
  phone: (u: User) => u.phone,
  email: (u: User) => u.email?.toLowerCase(),
  role: (u: User) => ROLE_LABELS[u.role] ?? u.role,
  active: (u: User) => (u.is_active ? 1 : 0),
};

function RoleBadge({ role }: { role: User['role'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold',
        role === 'admin' ? 'bg-primary-soft text-primary' : 'bg-soft text-muted',
      )}
    >
      {role === 'admin' ? <ShieldCheck size={11} /> : <UserIcon size={11} />}
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function NewUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<User['role']>('consultant');
  const qc = useQueryClient();

  const reset = () => {
    setName(''); setPhone(''); setEmail(''); setRole('consultant');
  };

  const submit = useMutation({
    mutationFn: () =>
      endpoints.users.create({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      reset();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Add user"
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            type="submit"
            form="new-user-form"
            loading={submit.isPending}
            disabled={!name.trim() || !phone.trim()}
          >
            Add
          </Button>
        </>
      }
    >
      <form
        id="new-user-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <Field label="Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Phone" required>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876500006" className={inputCls} />
        </Field>
        <Field label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} />
        </Field>
        <Field label="Role" required>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as User['role'])}
            className={inputCls}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
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

function EditUserModal({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<User['role']>(user.role);
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: () =>
      endpoints.users.patch(user.id, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit user"
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form="edit-user-form"
            loading={submit.isPending}
            disabled={!name.trim() || !phone.trim()}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="edit-user-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <Field label="Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Phone" required>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} />
        </Field>
        <Field label="Role" required>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as User['role'])}
            className={inputCls}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
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

function DeleteUserModal({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const remove = useMutation({
    mutationFn: () => endpoints.users.remove(user.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete user"
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
      <div className="space-y-3 text-[13px] text-text">
        <p>
          Permanently delete <span className="font-semibold">{user.name}</span> ({fmtPhone(user.phone)})?
        </p>
        <p className="text-[12px] text-subtle">
          Their enquiries, meetings and activity are kept but become unassigned. This can&apos;t be undone.
          To temporarily disable access instead, use the Active toggle.
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
