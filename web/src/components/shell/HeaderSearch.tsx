'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Search as SearchIcon, Users, Building2, User as UserIcon,
  ArrowRight, LayoutGrid, Calendar, FileText, Database, History, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { endpoints } from '@/lib/api/endpoints';
import type { EnquiryListItem, Company, Contact } from '@/lib/api/types';

/**
 * Header search — pill input with a live suggestion drawer.
 *
 * Behaviour (matches uploaded HTML):
 *   - `/` anywhere focuses the input.
 *   - **On focus with an empty query**, the drawer shows recommendations:
 *       "Suggested" — the 3 most recently updated enquiries
 *       "Recent"    — the last 5 typed queries (from localStorage)
 *       "Quick navigation" — module entry points
 *   - **On typing >= 2 chars**, replaces recommendations with live results
 *     grouped as Enquiries / Companies / Contacts.
 *   - ↑/↓ moves highlight; Enter opens it (or navigates to
 *     `/enquiries?search=<q>` on plain-Enter with no highlight).
 *   - Recent queries persist per-browser in `sp_recent_searches`.
 */

const K_RECENT = 'sp_recent_searches';

type Sugg =
  | { type: 'enquiry'; id: number; title: string; sub: string }
  | { type: 'company'; id: number; title: string; sub: string; search: string }
  | { type: 'contact'; id: number; title: string; sub: string; search: string }
  | { type: 'nav'; path: string; title: string; sub: string }
  | { type: 'recent'; query: string; title: string; sub: string };

const QUICK_NAV: Sugg[] = [
  { type: 'nav', path: '/dashboard', title: 'Dashboard', sub: 'Overview & KPIs' },
  { type: 'nav', path: '/enquiries', title: 'Enquiries', sub: 'All leads' },
  { type: 'nav', path: '/meetings', title: 'Meetings', sub: 'Upcoming + past' },
  { type: 'nav', path: '/companies', title: 'Companies', sub: 'Customer orgs' },
  { type: 'nav', path: '/contacts', title: 'Contacts', sub: 'People' },
  { type: 'nav', path: '/master-data', title: 'Master data', sub: 'Dropdowns / tags' },
];

export function HeaderSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<Sugg[]>([]);
  const [suggested, setSuggested] = useState<Sugg[]>([]);
  const [recent, setRecent] = useState<Sugg[]>(() => readRecent());
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Global `/` focuses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && /input|textarea|select/i.test(t.tagName))) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Outside-click closes.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Empty-focus recommendations — fetched when the panel opens with q=''.
  // Also refresh the Recent list on open so newly-committed queries appear
  // without a page reload.
  useEffect(() => {
    if (!open || q.trim().length >= 2) return;
    setRecent(readRecent());
    let cancelled = false;
    endpoints.enquiries.list({ ordering: '-updated_at', page_size: 3 })
      .then((page) => {
        if (cancelled) return;
        const items: Sugg[] = (page.results ?? []).slice(0, 3).map((e: EnquiryListItem) => ({
          type: 'enquiry' as const,
          id: e.id,
          title: e.company_name,
          sub: `${e.lead_id} · ${e.status}`,
        }));
        setSuggested(items);
      })
      .catch(() => setSuggested([]));
    return () => { cancelled = true; };
  }, [open, q]);

  // Live fetch (>=2 chars).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setLive([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [enq, co, ct] = await Promise.all([
          endpoints.enquiries.list({ search: term, page_size: 3 }),
          endpoints.companies.list({ search: term, page_size: 3 }),
          endpoints.contacts.list({ search: term, page_size: 3 }),
        ]);
        const merged: Sugg[] = [
          ...(enq.results ?? []).map((e: EnquiryListItem) => ({
            type: 'enquiry' as const,
            id: e.id,
            title: e.company_name,
            sub: `${e.lead_id} · ${e.status}`,
          })),
          ...(co.results ?? []).map((c: Company) => ({
            type: 'company' as const,
            id: c.id,
            title: c.name,
            sub: `${c.industry}${c.city ? ' · ' + c.city : ''}`,
            search: c.name,
          })),
          ...(ct.results ?? []).map((c: Contact) => ({
            type: 'contact' as const,
            id: c.id,
            title: c.name,
            sub: `${c.designation || 'Contact'} · ${c.company_name}`,
            search: c.name,
          })),
        ];
        setLive(merged);
        setActive(0);
      } catch {
        setLive([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [q]);

  const items = q.trim().length >= 2
    ? live
    : [...suggested, ...recent, ...QUICK_NAV];

  const go = (s: Sugg) => {
    setOpen(false);
    setQ('');
    if (s.type === 'enquiry') { router.push(`/enquiries/${s.id}`); return; }
    if (s.type === 'nav') { router.push(s.path); return; }
    const term = s.type === 'recent' ? s.query : (s as { search: string }).search;
    router.push(`/enquiries?search=${encodeURIComponent(term)}`);
  };

  const commitRecent = (term: string) => {
    if (!term.trim()) return;
    const next = [term, ...readRecent().map((r) => (r as { query: string }).query)]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 5);
    try { localStorage.setItem(K_RECENT, JSON.stringify(next)); } catch { /* noop */ }
    setRecent(readRecent());
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (items[active]) { go(items[active]); return; }
      const term = q.trim();
      if (term) {
        commitRecent(term);
        setOpen(false); setQ('');
        router.push(`/enquiries?search=${encodeURIComponent(term)}`);
      }
    }
  };

  const groups = buildGroups(items, q.trim().length >= 2);

  return (
    <div ref={wrapRef} className="relative hidden min-w-0 flex-1 md:block" role="search">
      <div
        className={cn(
          'flex h-11 w-full items-center gap-2.5 rounded-full bg-surface px-[18px] text-[14px] text-subtle',
          'border border-b-subtle shadow-card cursor-text',
          'transition-shadow duration-fast',
          'focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--primary-soft)]',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <SearchIcon size={15} strokeWidth={1.8} className="shrink-0 text-subtle" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          type="text"
          autoComplete="off"
          placeholder="Search enquiries, companies, contacts…"
          className="min-w-0 flex-1 bg-transparent text-text placeholder:text-subtle focus:outline-none"
        />
        <span className="shrink-0 rounded-md border border-b-subtle bg-soft px-2 py-[2px] text-[11px] font-bold text-subtle">
          /
        </span>
      </div>

      {open && (
        <div
          className={cn(
            'absolute left-0 right-0 top-[calc(100%+8px)] z-[70] max-h-[420px] overflow-y-auto rounded-lg border border-b-subtle bg-surface p-1.5 shadow-pop',
            'animate-slide-up',
          )}
        >
          {q.trim().length >= 2 && loading && items.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-subtle">Searching…</div>
          ) : q.trim().length >= 2 && items.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-subtle">
              No matches for &ldquo;{q}&rdquo;.
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-subtle">
              Nothing to suggest yet — type to search.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.title} className="mb-1">
                <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                  {g.icon}
                  {g.title}
                </div>
                {g.items.map((it) => {
                  const idx = items.indexOf(it);
                  const isActive = idx === active;
                  const key = keyOf(it);
                  return (
                    <button
                      key={key}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(it)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-[9px] px-2.5 py-2 text-left',
                        isActive ? 'bg-soft' : 'hover:bg-soft',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]',
                          iconTone(it.type),
                        )}
                      >
                        {iconFor(it.type)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-text">
                          {it.title}
                        </span>
                        <span className="block truncate text-[11.5px] text-subtle">
                          {it.sub}
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        className={cn(
                          'shrink-0 text-subtle transition-opacity',
                          isActive ? 'opacity-100' : 'opacity-40',
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function readRecent(): Sugg[] {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(K_RECENT);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    return arr.filter((s) => typeof s === 'string').slice(0, 5).map((query) => ({
      type: 'recent',
      query,
      title: query,
      sub: 'Recent search',
    }));
  } catch {
    return [];
  }
}

function keyOf(s: Sugg): string {
  if (s.type === 'nav') return `nav:${s.path}`;
  if (s.type === 'recent') return `recent:${s.query}`;
  return `${s.type}:${(s as { id: number }).id}`;
}

function buildGroups(items: Sugg[], isLive: boolean) {
  type G = { title: string; icon: React.ReactNode; items: Sugg[] };
  const groups: G[] = [];
  const push = (title: string, icon: React.ReactNode, filter: (s: Sugg) => boolean) => {
    const g = items.filter(filter);
    if (g.length > 0) groups.push({ title, icon, items: g });
  };
  if (isLive) {
    push('Enquiries', null, (s) => s.type === 'enquiry');
    push('Companies', null, (s) => s.type === 'company');
    push('Contacts', null, (s) => s.type === 'contact');
  } else {
    push('Suggested', <Sparkles size={11} className="text-primary" />, (s) => s.type === 'enquiry');
    push('Recent', <History size={11} className="text-subtle" />, (s) => s.type === 'recent');
    push('Quick navigation', null, (s) => s.type === 'nav');
  }
  return groups;
}

function iconFor(t: Sugg['type']) {
  if (t === 'enquiry') return <Users size={15} strokeWidth={1.9} />;
  if (t === 'company') return <Building2 size={15} strokeWidth={1.9} />;
  if (t === 'contact') return <UserIcon size={15} strokeWidth={1.9} />;
  if (t === 'recent') return <History size={15} strokeWidth={1.9} />;
  return <LayoutGrid size={15} strokeWidth={1.9} />;
}

function iconTone(t: Sugg['type']) {
  if (t === 'enquiry') return 'bg-primary-soft text-primary';
  if (t === 'company') return 'bg-accent-soft text-accent';
  if (t === 'contact') return 'bg-teal-soft text-teal';
  if (t === 'recent') return 'bg-soft text-muted';
  return 'bg-sunken text-muted';
}

// Silence unused imports if some icons aren't wired inline.
void Calendar; void FileText; void Database;
