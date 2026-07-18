'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search as SearchIcon,
  ChevronDown,
  Phone as PhoneIcon,
  Mail as MailIcon,
  Copy as CopyIcon,
  Check as CheckIcon,
  X as XIcon,
  MoreHorizontal,
  Download,
  Filter,
  Star,
  Building2,
  Calendar,
  IndianRupee,
  Users as UsersIcon,
  Trash2,
} from 'lucide-react';
import {
  Briefcase, CircleDot, Trophy, XCircle,
} from 'lucide-react';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { Button } from '@/components/ui/Button';
import { MiniKpi, MiniKpiStrip } from '@/components/ui/MiniKpi';
import { EmptyState } from '@/components/ui/EmptyState';
import { Reveal } from '@/components/ui/Reveal';
import { useModals } from '@/components/shell/ModalHost';
import { DateField } from '@/components/ui/DateField';
import { endpoints } from '@/lib/api/endpoints';
import { Modal } from '@/components/ui/Modal';
import { fmtInrShort } from '@/lib/utils/format';
import { ddmm, timeAgo, avatarColor, initials, fmtPhone } from '@/lib/utils/format';
import { isValidDDMM, ddmmToISO, isoToDDMM } from '@/lib/utils/date';
import { VALUE_BANDS, bandLabel } from '@/lib/utils/valueBand';
import { useMasterDataValues } from '@/lib/hooks/useMasterData';
import { cn } from '@/lib/utils/cn';
import type { EnquiryListItem } from '@/lib/api/types';

/**
 * Enquiries — /enquiries.
 *
 * Layout mirrors the uploaded Enterprise_CRM_Mockup_Airy.html `#m-leads`
 * table:
 *
 *   [ ] · Enquiry ID · Company · Contact person · Contact details ·
 *       Source · Type · Status · Last activity · ⋯
 *
 * Filter chips (Status / Type / Source / Industry) sit in `.tbl-tools`
 * with a pill Search field; picking a chip pushes a URL param and TanStack
 * Query re-fetches. Bulk-selection bar appears when >=1 row is checked.
 */

// Fallback only — real options come from Master Data (useMasterDataValues
// below) so anything an admin adds there actually shows up here. These
// stay as the safety net for the narrow window before a category has ever
// been populated.
const STATUSES_FALLBACK = [
  'New', 'In Progress', 'Won', 'Lost', 'Spam',
] as const;
const TYPES_FALLBACK = ['Hot', 'Warm', 'Cold'] as const;
const SOURCES_FALLBACK = ['Referral', 'Website', 'Cold call', 'Exhibition', 'Partner'] as const;
const INDUSTRIES_FALLBACK = [
  'Dairy', 'FMCG', 'Beverages', 'Agri-inputs', 'Cold chain',
  'Bakery', 'Frozen foods', 'Confectionery', 'Ready-to-eat', 'Nutraceuticals',
] as const;

const PAGE_SIZE = 25;

export default function EnquiriesPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const statusOptions = useMasterDataValues('status', STATUSES_FALLBACK);
  const typeOptions = useMasterDataValues('enquiry_type', TYPES_FALLBACK);
  const sourceOptions = useMasterDataValues('source', SOURCES_FALLBACK);
  const industryOptions = useMasterDataValues('industry', INDUSTRIES_FALLBACK);

  const search = sp.get('search') ?? '';
  const status = sp.get('status') ?? '';
  const type = sp.get('enquiry_type') ?? '';
  const source = sp.get('source') ?? '';
  const industry = sp.get('industry') ?? '';
  const valueBand = sp.get('value_band') ?? '';
  const dateFrom = sp.get('date_from') ?? '';
  const dateTo = sp.get('date_to') ?? '';
  const ordering = sp.get('ordering') ?? '-created_at';
  const page = Number(sp.get('page') ?? '1');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const modals = useModals();

  // Deep-linkable: any external context can still send the user to
  // `/enquiries?new=1` to open the modal. The global ModalHost owns the
  // open/close state so the modal appears IN PLACE on this page — no flash.
  useEffect(() => {
    if (sp.get('new') === '1') {
      modals.open('newEnquiry');
      const n = new URLSearchParams(sp.toString());
      n.delete('new');
      router.replace(`/enquiries${n.toString() ? '?' + n.toString() : ''}`);
    }
  }, [sp, router, modals]);

  const setParam = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === undefined) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    router.push(`/enquiries${next.toString() ? '?' + next.toString() : ''}`);
  };

  // Drives the empty state: an empty list means something different when the
  // user has narrowed it than when the pipeline is genuinely empty.
  const hasActiveFilters = Boolean(
    search || status || type || source || industry || valueBand || dateFrom || dateTo,
  );
  const clearFilters = () =>
    router.push('/enquiries');

  const listQ = useQuery({
    queryKey: [
      'enquiries', 'list',
      { search, status, type, source, industry, valueBand, dateFrom, dateTo, ordering, page, page_size: PAGE_SIZE },
    ],
    queryFn: () => endpoints.enquiries.list({
      search: search || undefined,
      status: status || undefined,
      // Server-side band filter on expected_close_date — covers the whole
      // dataset, not just the loaded page, and keeps `count` accurate.
      derived_type: type || undefined,
      source: source || undefined,
      industry: industry || undefined,
      // Same deal: banded on expected_value server-side, for the same reason.
      value_band: valueBand || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      ordering,
      page,
      page_size: PAGE_SIZE,
    }),
  });

  const rows = listQ.data?.results ?? [];
  const total = listQ.data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Dashboard payload feeds the sticky KPI strip — it returns team-wide
  // stage counts and pipeline value in one round-trip, so we don't need to
  // aggregate on the client.
  const dashQ = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => endpoints.dashboard(),
  });
  const dash = dashQ.data;
  const wonCount = dash?.by_stage?.find((r) => r.status === 'Won')?.count ?? 0;
  const lostCount = dash?.by_stage?.find((r) => r.status === 'Lost')?.count ?? 0;
  const openCount = dash?.open_enquiries ?? 0;
  const pipelineValue = Number(dash?.pipeline_value ?? 0);
  // Every tile in the strip reads from the dashboard payload, which is always
  // whole-pipeline. Total used to come from the filtered list instead, so
  // filtering to Won put "Total 17" next to "Open 50" — a total smaller than
  // its own subset. The strip is the overview; the subtitle below says what
  // the table is actually showing.
  const grandTotal = dash?.total_enquiries ?? total;

  useEffect(() => { setSelected(new Set()); }, [page, search, status, type, source, industry, ordering, dateFrom, dateTo]);

  const toggleRow = (id: number) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  };

  return (
    <>
      <SectionHeader
        title="Enquiries"
        // Says what the table is showing, which is the one thing the KPI strip
        // can't: the strip is always whole-pipeline. Repeating the count here
        // was a third copy of the Total tile sitting directly beneath it.
        // Filtered, this is the only place the full size is still visible.
        subtitle={
          hasActiveFilters
            ? `Showing ${total} of ${grandTotal} — filters applied`
            : 'Every lead, with its timeline, meetings and proposals in one place.'
        }
        hideSearch={false}
        actions={
          <>
            <Button
              variant="success"
              leftIcon={<Download size={14} />}
              onClick={() => exportEnquiriesCsv(rows)}
              disabled={rows.length === 0}
            >
              Export to Excel
            </Button>
            <Button leftIcon={<Plus size={15} />} onClick={() => modals.open('newEnquiry')}>
              New Enquiry
            </Button>
          </>
        }
      />

      <div className="w-full px-3 pt-3 pb-5 xl:px-4">
        <MiniKpiStrip columns={5}>
          <MiniKpi
            label="Total"
            value={grandTotal}
            tone="primary"
            icon={<Briefcase size={17} strokeWidth={1.9} />}
          />
          <MiniKpi
            label="Open"
            value={openCount}
            tone="primary"
            icon={<CircleDot size={17} strokeWidth={1.9} />}
          />
          {/* "est." is not decoration: deal value is picked as a band and
              stored as that band's midpoint, so this total is a sum of
              midpoints, not of quoted figures. Labelling it as exact would
              overstate what the number actually knows. */}
          <MiniKpi
            label="Pipeline (est.)"
            value={fmtInrShort(pipelineValue)}
            tone="warning"
            icon={<Briefcase size={17} strokeWidth={1.9} />}
          />
          <MiniKpi
            label="Won"
            value={wonCount}
            tone="success"
            icon={<Trophy size={17} strokeWidth={1.9} />}
          />
          <MiniKpi
            label="Lost"
            value={lostCount}
            tone="danger"
            icon={<XCircle size={17} strokeWidth={1.9} />}
          />
        </MiniKpiStrip>

        {/* Bulk-select bar */}
        {selected.size > 0 && (
          <BulkBar
            selectedIds={[...selected]}
            rows={rows}
            onDone={() => {
              setSelected(new Set());
              listQ.refetch();
            }}
          />
        )}

        <div className="rounded-lg border border-b-subtle bg-surface shadow-card">
          {/* Tools row: search pill + filter chips */}
          <div className="flex flex-wrap items-center gap-2.5 px-[18px] py-4">
            <SearchPill
              initial={search}
              onSubmit={(v) => setParam({ search: v || null })}
            />
            <FilterChip
              icon={<Filter size={12} />} label="Status" value={status}
              options={statusOptions}
              onPick={(v) => setParam({ status: v })}
            />
            <FilterChip
              icon={<Star size={12} />} label="Enquiry type" value={type}
              options={typeOptions}
              onPick={(v) => setParam({ enquiry_type: v })}
            />
            <FilterChip
              icon={<Filter size={12} />} label="Source" value={source}
              options={sourceOptions}
              onPick={(v) => setParam({ source: v })}
            />
            <FilterChip
              icon={<Building2 size={12} />} label="Industry" value={industry}
              options={industryOptions}
              onPick={(v) => setParam({ industry: v })}
            />
            <FilterChip
              icon={<IndianRupee size={12} />} label="Deal size" value={valueBand}
              options={VALUE_BANDS.map((b) => b.id)}
              optionLabel={(id) => VALUE_BANDS.find((b) => b.id === id)?.label ?? id}
              onPick={(v) => setParam({ value_band: v })}
            />
            <DateRangeFilterChip
              from={dateFrom}
              to={dateTo}
              onApply={(f, t) => setParam({ date_from: f, date_to: t })}
            />
          </div>

          {/* Table — its own scroll container. Height is tuned so the table
              extends as far down as the fixed chrome allows:
                app padding 28 + section header 84 + content py 40 +
                card tools 80 + pager footer 50 ≈ 282 px of chrome.
              Rounded to 260 so the table body just reaches the pager. */}
          <div
            className="sp-scroll overflow-auto"
            style={{ maxHeight: 'calc(100dvh - 260px)' }}
          >
            {/* COLUMN PRIORITY — the table used to be a flat min-w-[1200px], so
                in a half-screen window (measured at 820px viewport) 547px of it
                sat off-screen and every row had to be read by scrolling
                sideways. Columns now drop by priority as the viewport narrows,
                and the min-width steps down with them so what remains fits.

                  always      checkbox · Enquiry ID · Company · Status · actions
                  md+ (768)   + Contact person, Last activity
                  lg+ (1024)  + Enquiry type
                  xl+ (1280)  + Contact details, Enquiry source

                Contact details and source go first: they're the widest and are
                both on the enquiry's own page, so nothing is truly lost. Every
                hidden th has a matching td with the SAME classes — miss one and
                the column headers silently shift off by one against the body. */}
            {/* Each min-width is set just UNDER the space actually available at
                that breakpoint (viewport − rail 94px − shell padding 28px −
                scrollbar), so the visible columns fill the width without
                tipping back into a horizontal scroll. Measured, not guessed:
                at 1280 the old flat 1200px still overflowed by 95px. */}
            <table className="w-full min-w-0 text-[12.5px] md:min-w-[600px] lg:min-w-[820px] xl:min-w-[1090px]">
              <thead>
                <tr>
                  <Th style={{ width: 42 }}>
                    <Cbx
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={toggleAll}
                    />
                  </Th>
                  <SortableTh
                    label="Enquiry ID" ordering={ordering} field="created_at"
                    onSort={(o) => setParam({ ordering: o })}
                  />
                  <SortableTh
                    label="Company" ordering={ordering} field="company__name"
                    onSort={(o) => setParam({ ordering: o })}
                  />
                  <SortableTh
                    className="hidden md:table-cell"
                    label="Contact person" ordering={ordering} field="contact__name"
                    onSort={(o) => setParam({ ordering: o })}
                  />
                  <Th className="hidden xl:table-cell">Contact details</Th>
                  <SortableTh
                    className="hidden xl:table-cell"
                    label="Enquiry source" ordering={ordering} field="source"
                    onSort={(o) => setParam({ ordering: o })}
                  />
                  {/* Type derives from expected close date, so the sort
                      proxies through that column. */}
                  <SortableTh
                    className="hidden lg:table-cell"
                    label="Enquiry type" ordering={ordering} field="expected_close_date"
                    onSort={(o) => setParam({ ordering: o })}
                  />
                  <SortableTh
                    label="Status" ordering={ordering} field="status"
                    onSort={(o) => setParam({ ordering: o })}
                  />
                  <SortableTh
                    className="hidden md:table-cell"
                    label="Last activity" ordering={ordering} field="updated_at"
                    onSort={(o) => setParam({ ordering: o })}
                  />
                  <Th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {listQ.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-b-subtle">
                      <td colSpan={10} className="px-4 py-3">
                        <div className="h-4 sp-skeleton" />
                      </td>
                    </tr>
                  ))
                ) : listQ.error ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-[12px] text-danger">
                      Couldn&rsquo;t load enquiries: {(listQ.error as Error).message}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      {/* "You have no enquiries" and "your filters match none"
                          are different situations — showing the first when the
                          second is true makes people think their data is gone.
                          So the copy and the action both follow the filters. */}
                      {hasActiveFilters ? (
                        <EmptyState
                          icon={SearchIcon}
                          title="No enquiries match these filters"
                          message="Nothing here fits every filter you've applied. Try widening one, or clear them to see the full pipeline."
                          action={
                            <Button variant="secondary" size="sm" onClick={clearFilters}>
                              Clear all filters
                            </Button>
                          }
                        />
                      ) : (
                        <EmptyState
                          icon={Briefcase}
                          title="No enquiries yet"
                          message="Every lead logged shows up here — with its timeline, meetings and proposals in one place."
                          action={
                            <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => modals.open('newEnquiry')}>
                              New Enquiry
                            </Button>
                          }
                        />
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((e) => (
                    <Row
                      key={e.id}
                      e={e}
                      selected={selected.has(e.id)}
                      onToggle={() => toggleRow(e.id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-b-subtle px-[18px] py-3.5 text-[12px] text-muted">
            <span>
              Showing <b className="font-mono tabular-nums text-text">{rows.length}</b> of{' '}
              <b className="font-mono tabular-nums text-text">{total}</b>
            </span>
            <div className="flex items-center gap-1">
              <PagerBtn disabled={page <= 1} onClick={() => setParam({ page: page - 1 })}>
                Prev
              </PagerBtn>
              <span className="px-2 tabular-nums text-text">
                {page} / {pageCount}
              </span>
              <PagerBtn
                disabled={page >= pageCount}
                onClick={() => setParam({ page: page + 1 })}
              >
                Next
              </PagerBtn>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}

// -------------------- row --------------------

function Row({
  e,
  selected,
  onToggle,
}: {
  e: EnquiryListItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const open = () => router.push(`/enquiries/${e.id}`);
  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      }}
      title={`Open ${e.lead_id}`}
      className={cn(
        'cursor-pointer border-t border-b-subtle transition-colors hover:bg-soft',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft',
        selected && 'bg-primary-soft/40',
      )}
    >
      <Td>
        <Cbx checked={selected} onChange={onToggle} />
      </Td>
      <Td>
        <div className="font-mono tabular-nums text-[11.5px] font-semibold text-text">{e.lead_id}</div>
        <div className="mt-0.5 text-[10.5px] font-medium text-subtle">{ddmm(e.created_at)}</div>
      </Td>
      <Td>
        <div className="flex flex-col items-start gap-1">
          <span className="font-semibold text-text">{e.company_name}</span>
          <IndustryBadge industry={e.industry} />
        </div>
      </Td>
      <Td className="hidden md:table-cell">
        {e.contact_name ? (
          <div className="flex flex-col">
            <span className="text-text">{e.contact_name}</span>
            {/* Designation under the name rather than in its own column: it
                only means anything next to the person it belongs to, and the
                table is already tight at laptop widths. */}
            {e.contact_designation && (
              <span className="text-[11px] text-subtle">{e.contact_designation}</span>
            )}
          </div>
        ) : (
          '—'
        )}
      </Td>
      <Td className="hidden xl:table-cell">
        <div className="flex flex-col gap-[3px] whitespace-nowrap text-[12px] text-muted">
          {e.phone && (
            <CopyLine icon={<PhoneIcon size={13} className="text-subtle" strokeWidth={1.8} />} value={fmtPhone(e.phone)} />
          )}
          {e.email && (
            <CopyLine icon={<MailIcon size={13} className="text-subtle" strokeWidth={1.8} />} value={e.email} />
          )}
          {!e.phone && !e.email && <span className="text-subtle">—</span>}
        </div>
      </Td>
      <Td className="hidden xl:table-cell">{e.source}</Td>
      <Td className="hidden lg:table-cell">
        <PriPill t={e.derived_type} />
      </Td>
      <Td>
        <StatusBadge s={e.status} />
      </Td>
      <Td className="hidden whitespace-nowrap md:table-cell">
        <div className="flex items-center gap-2">
          {e.owner_name && (
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
              style={{ background: avatarColor(e.owner_name) }}
              title={e.owner_name}
            >
              {initials(e.owner_name)}
            </span>
          )}
          <span className="text-[12px] text-muted">{timeAgo(e.updated_at)}</span>
        </div>
      </Td>
      <Td>
        <RowActionsMenu e={e} />
      </Td>
    </tr>
  );
}

/** Menu box: w-52 plus a rough height for 6 items — only used to decide whether
 *  there's room below the button or the menu should flip above it. */
const ROW_MENU_W = 208;
const ROW_MENU_H = 232;

function RowActionsMenu({ e }: { e: EnquiryListItem }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Position is computed from the button's viewport rect because the menu is
  // portalled to <body> and so can't inherit the cell's coordinates.
  useEffect(() => {
    if (!open) { setMenuPos(null); return; }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const flipUp = r.bottom + ROW_MENU_H > window.innerHeight;
      setMenuPos({
        top: flipUp ? Math.max(8, r.top - ROW_MENU_H - 4) : r.bottom + 4,
        // Right-aligned to the button, then clamped so a menu near either edge
        // of the window stays fully on screen.
        left: Math.min(
          Math.max(8, r.right - ROW_MENU_W),
          window.innerWidth - ROW_MENU_W - 8,
        ),
      });
    };
    place();

    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node;
      // The menu is no longer inside `ref`, so an outside-click test has to
      // exempt the portalled menu too or every click on it would close it.
      if (ref.current?.contains(t)) return;
      if ((t as Element)?.closest?.('[role="menu"]')) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false);
    // Fixed positioning doesn't follow a scrolling ancestor, so the menu would
    // hang in place while the table moved under it. Close instead of chasing it.
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const stop = (ev: React.MouseEvent) => { ev.stopPropagation(); };
  const copy = (value: string) => {
    navigator.clipboard.writeText(value).catch(() => { /* ignore */ });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative" onClick={stop}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Row actions"
        aria-expanded={open}
        onClick={(ev) => { ev.stopPropagation(); setOpen((v) => !v); }}
        className="rounded-md p-1.5 text-subtle hover:bg-soft hover:text-text"
      >
        <MoreHorizontal size={16} />
      </button>
      {/* Rendered into <body>, not here. As an absolutely-positioned child of a
          cell it still counted toward the table scroller's scrollable overflow,
          so opening it grew the container (measured: 747px -> 930px) — the table
          appeared to stretch and the scrollbar jumped. A portal + fixed
          positioning takes it out of that calculation entirely. */}
      {open && menuPos && createPortal(
        <div
          role="menu"
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-[95] w-52 overflow-hidden rounded-lg border border-b-subtle bg-surface p-1 shadow-pop animate-slide-up"
          onClick={(ev) => ev.stopPropagation()}
        >
          <a
            role="menuitem"
            href={`/enquiries/${e.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-text hover:bg-soft"
          >
            Open in new tab
          </a>
          <MenuItem onSelect={() => copy(e.company_name)}>Copy company name</MenuItem>
          <MenuItem onSelect={() => copy(e.lead_id)}>Copy lead ID</MenuItem>
          {e.phone && <MenuItem onSelect={() => copy(fmtPhone(e.phone))}>Copy phone</MenuItem>}
          {e.email && <MenuItem onSelect={() => copy(e.email)}>Copy email</MenuItem>}
          {/* Separated and tinted because it's the one entry here that destroys
              something — every other item copies a string. Not role-gated in the
              UI: consultants can't reach the web console at all (canUseConsole
              blocks them at login), and IsConsoleUser on the server is the real
              gate either way. */}
          <div className="my-1 border-t border-b-subtle" />
          <MenuItem
            tone="danger"
            onSelect={() => { setOpen(false); setConfirmDelete(true); }}
          >
            <Trash2 size={13} /> Delete lead
          </MenuItem>
        </div>,
        document.body,
      )}
      <DeleteEnquiryModal
        e={e}
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

/**
 * Permanent-delete confirmation. Names the lead and spells out what else goes
 * with it, because the row itself gives no hint that its whole timeline,
 * meetings and proposals are attached.
 */
function DeleteEnquiryModal({
  e,
  open,
  onClose,
}: {
  e: EnquiryListItem;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const remove = useMutation({
    mutationFn: () => endpoints.enquiries.remove(e.id),
    onSuccess: () => {
      // The list, the dashboard KPIs and the meetings list all counted this
      // enquiry, so all three are now stale.
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['meetings'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete lead"
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] text-text" onClick={(ev) => ev.stopPropagation()}>
        <p>
          Permanently delete{' '}
          <span className="font-semibold">{e.lead_id}</span>
          {e.company_name ? <> &middot; <span className="font-semibold">{e.company_name}</span></> : null}?
        </p>
        <p className="text-[12px] text-subtle">
          Its touchpoints, negotiation rounds, follow-ups, proposals and meetings are
          deleted with it. The company and contact records are kept. This can&rsquo;t be
          undone &mdash; to take a lead out of the pipeline without losing its history,
          set its status to Lost instead.
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

function MenuItem({
  onSelect,
  children,
  tone = 'default',
}: {
  onSelect: () => void;
  children: ReactNode;
  /** 'danger' tints destructive entries so they don't read as one more copy action. */
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(ev) => { ev.stopPropagation(); onSelect(); }}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px]',
        tone === 'danger'
          ? 'text-danger hover:bg-danger-soft'
          : 'text-text hover:bg-soft',
      )}
    >
      {children}
    </button>
  );
}

function CopyLine({ icon, value }: { icon: ReactNode; value: string }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async (ev: React.MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch { /* ignore */ }
  };
  return (
    <span className="group flex items-center gap-1.5">
      {icon}
      <span className="truncate">{value}</span>
      <button
        type="button"
        onClick={doCopy}
        title="Copy"
        aria-label="Copy"
        className={cn(
          'ml-1 opacity-0 transition-opacity duration-fast group-hover:opacity-100',
          copied ? 'text-success opacity-100' : 'text-subtle hover:text-primary',
        )}
      >
        {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
      </button>
    </span>
  );
}

// -------------------- primitives --------------------

function Th({
  children,
  style,
  className,
}: {
  children?: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <th
      style={style}
      className={cn(
        'sticky top-0 z-[5] whitespace-nowrap px-[10px] py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-subtle',
        'bg-sunken shadow-[inset_0_-1px_0_var(--b-default)]',
        className,
      )}
    >
      {children}
    </th>
  );
}

function SortableTh({
  label,
  ordering,
  field,
  onSort,
  className,
}: {
  label: string;
  ordering: string;
  field: string;
  onSort: (next: string) => void;
  /** Responsive visibility — see COLUMN PRIORITY on the <table>. */
  className?: string;
}) {
  const activeField = ordering.replace('-', '');
  const active = activeField === field;
  const dir = ordering.startsWith('-') ? 'desc' : 'asc';
  const next = active
    ? (dir === 'desc' ? field : `-${field}`)
    : `-${field}`;
  return (
    <th
      onClick={() => onSort(next)}
      className={cn(
        'sticky top-0 z-[5] cursor-pointer select-none whitespace-nowrap px-[10px] py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider',
        'shadow-[inset_0_-1px_0_var(--b-default)]',
        active
          ? 'bg-primary-soft text-primary'
          : 'bg-sunken text-subtle hover:text-text',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {label}
        <span
          aria-hidden
          className={cn(
            'inline-block',
            active ? 'opacity-100' : 'opacity-40',
          )}
          style={{
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            ...(active && dir === 'desc'
              ? { borderTop: '5px solid currentColor' }
              : { borderBottom: '5px solid currentColor' }),
          }}
        />
      </span>
    </th>
  );
}

function Td({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}) {
  return (
    <td onClick={onClick} className={cn('px-[10px] py-3 align-middle', className)}>
      {children}
    </td>
  );
}

/**
 * Industry label — visually distinct from the status pills / priority pills.
 * Uses a SQUARE-ish `rounded-sm` shape (vs `rounded-full` used everywhere else),
 * a solid colored left band, and an uppercase tracked label — reads as a
 * "category tag" instead of a status pill so the eye separates it from the
 * status / priority chips on the same row.
 */
function IndustryBadge({ industry }: { industry: string | null | undefined }) {
  const tone: Record<string, { bar: string; text: string; bg: string }> = {
    Dairy:           { bar: 'bg-primary', text: 'text-primary', bg: 'bg-primary-soft' },
    FMCG:            { bar: 'bg-accent',  text: 'text-accent',  bg: 'bg-accent-soft'  },
    Beverages:       { bar: 'bg-info',    text: 'text-info',    bg: 'bg-info-soft'    },
    'Agri-inputs':   { bar: 'bg-success', text: 'text-success', bg: 'bg-success-soft' },
    'Cold chain':    { bar: 'bg-teal',    text: 'text-teal',    bg: 'bg-teal-soft'    },
    Bakery:          { bar: 'bg-warning', text: 'text-warning', bg: 'bg-warning-soft' },
    'Frozen foods':  { bar: 'bg-purple',  text: 'text-purple',  bg: 'bg-purple-soft'  },
    Confectionery:   { bar: 'bg-danger',  text: 'text-danger',  bg: 'bg-danger-soft'  },
    'Ready-to-eat':  { bar: 'bg-accent',  text: 'text-accent',  bg: 'bg-accent-soft'  },
    Nutraceuticals:  { bar: 'bg-success', text: 'text-success', bg: 'bg-success-soft' },
  };
  const label = industry?.trim() || 'Uncategorised';
  const t = tone[label] ?? { bar: 'bg-muted', text: 'text-muted', bg: 'bg-soft' };
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center overflow-hidden rounded-sm',
        'text-[10px] font-bold uppercase tracking-[0.55px] leading-none',
        t.bg, t.text,
      )}
    >
      <span className={cn('h-full w-[3px] shrink-0 self-stretch', t.bar)} aria-hidden />
      <span className="truncate px-[7px] py-[3px]">{label}</span>
    </span>
  );
}

function PriPill({ t }: { t: string }) {
  const tone: Record<string, string> = {
    Hot: 'bg-danger-soft text-danger',
    Warm: 'bg-warning-soft text-warning',
    Cold: 'bg-sunken text-muted',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[7px] px-[9px] py-[3px] text-[11px] font-bold',
        tone[t] ?? 'bg-soft text-muted',
      )}
    >
      {t}
    </span>
  );
}

function StatusBadge({ s }: { s: string }) {
  const tone: Record<string, string> = {
    New: 'bg-info-soft text-info',
    'In Progress': 'bg-warning-soft text-warning',
    Won: 'bg-success-soft text-success',
    Lost: 'bg-danger-soft text-danger',
    Spam: 'bg-sunken text-muted',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-[11px] py-[4px] text-[11.5px] font-semibold whitespace-nowrap',
        tone[s] ?? 'bg-sunken text-muted',
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s}
    </span>
  );
}

function SearchPill({
  initial,
  onSubmit,
}: {
  initial: string;
  onSubmit: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  // Sync from URL if it changes externally (Clear all, filter chip).
  useEffect(() => setV(initial), [initial]);
  // Debounce onChange: 220ms after typing stops, push the value up so the
  // list refetches. Enter still commits immediately (form submit).
  useEffect(() => {
    if (v === initial) return;
    const t = setTimeout(() => onSubmit(v.trim()), 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v.trim());
      }}
      role="search"
      className="flex h-10 min-w-[240px] flex-1 items-center gap-2.5 rounded-full bg-soft px-[15px]"
    >
      <SearchIcon size={15} strokeWidth={1.8} className="text-subtle" aria-hidden />
      <input
        type="search"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Filter by company, contact, phone, lead ID…"
        aria-label="Filter this list"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-text placeholder:text-subtle focus:outline-none"
      />
    </form>
  );
}

function FilterChip({
  icon,
  label,
  value,
  options,
  onPick,
  disabled,
  optionLabel = (v) => v,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  options: string[];
  onPick: (v: string | null) => void;
  disabled?: boolean;
  /**
   * Display text for an option when it differs from the wire value — deal-size
   * bands send a terse id ("4-6") but read as "₹4–6 L". Defaults to identity,
   * so filters whose value is already their label pass nothing.
   */
  optionLabel?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isOpen = open && !disabled;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-[8px] text-[12.5px] font-semibold',
          'transition-colors duration-fast',
          disabled && 'cursor-not-allowed opacity-50',
          isOpen
            ? 'border-primary bg-primary-soft text-primary'
            : value
              ? 'border-primary bg-primary-soft text-primary'
              : 'border-b-default bg-surface text-muted hover:bg-soft',
        )}
      >
        {icon}
        {label}
        {value && <span>· {optionLabel(value)}</span>}
        <ChevronDown
          size={13}
          className={cn('opacity-60 transition-transform', isOpen && 'rotate-180')}
        />
      </button>
      {isOpen && (
        <div
          role="listbox"
          className={cn(
            'absolute left-0 top-[calc(100%+6px)] z-40 min-w-[180px] rounded-lg border border-b-subtle bg-surface p-1.5 shadow-pop',
            'animate-slide-up',
          )}
        >
          <button
            type="button"
            onClick={() => { onPick(null); setOpen(false); }}
            className={cn(
              'block w-full whitespace-nowrap rounded-lg px-[11px] py-2 text-left text-[12.5px]',
              !value ? 'bg-primary-soft font-semibold text-primary' : 'text-text hover:bg-soft',
            )}
          >
            Any {label.toLowerCase()}
          </button>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => { onPick(o); setOpen(false); }}
              className={cn(
                'block w-full whitespace-nowrap rounded-lg px-[11px] py-2 text-left text-[12.5px]',
                value === o ? 'bg-primary-soft font-semibold text-primary' : 'text-text hover:bg-soft',
              )}
            >
              {optionLabel(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * DateRangeFilterChip — created_at range filter for the Enquiry ID column.
 * Was previously a dead `disabled` stub (options=[], onPick=()=>{}); this is
 * the real thing, mirroring FilterChip's popover chrome with two DateFields.
 */
function DateRangeFilterChip({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string | null, to: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fromStr, setFromStr] = useState(isoToDDMM(from));
  const [toStr, setToStr] = useState(isoToDDMM(to));
  // Anchor the popover to whichever side actually has room — the chip row
  // can leave this button anywhere from flush-left to flush-right depending
  // on viewport width and how many other filters are active, so a fixed
  // left/right guess clips on one side or the other.
  const [alignRight, setAlignRight] = useState(false);
  const POPOVER_W = 240;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setFromStr(isoToDDMM(from));
      setToStr(isoToDDMM(to));
    }
  }, [open, from, to]);

  useEffect(() => {
    if (!open) return;
    const recomputeAlign = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.left;
      const spaceLeft = rect.right;
      setAlignRight(spaceRight < POPOVER_W && spaceLeft > spaceRight);
    };
    recomputeAlign();
    // Resizing the viewport while open (not portaled, so no scroll-drift
    // risk like DateField/TimeField — only the left/right edge choice can
    // go stale) without this would leave the popover clipped off-screen.
    window.addEventListener('resize', recomputeAlign);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // DateField/TimeField portal their own popover to document.body, so
      // it's no longer a DOM descendant of `ref` — without this check,
      // picking a day here read as an "outside" click and closed the whole
      // Date filter before the user could touch the To field.
      if (!ref.current?.contains(t) && !t.closest?.('[data-datefield-popover]')) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', recomputeAlign);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = !!(from || to);
  const label = active
    ? `${from ? ddmm(from) : '…'}–${to ? ddmm(to) : '…'}`
    : '';

  const fromValid = fromStr === '' || isValidDDMM(fromStr);
  const toValid = toStr === '' || isValidDDMM(toStr);

  const apply = () => {
    onApply(ddmmToISO(fromStr), ddmmToISO(toStr));
    setOpen(false);
  };
  const clear = () => {
    setFromStr('');
    setToStr('');
    onApply(null, null);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-[8px] text-[12.5px] font-semibold',
          'transition-colors duration-fast',
          open || active
            ? 'border-primary bg-primary-soft text-primary'
            : 'border-b-default bg-surface text-muted hover:bg-soft',
        )}
      >
        <Calendar size={12} />
        Date
        {label && <span>· {label}</span>}
        <ChevronDown size={13} className={cn('opacity-60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="dialog"
          className={cn(
            'absolute top-[calc(100%+6px)] z-40 w-[240px] rounded-lg border border-b-subtle bg-surface p-3 shadow-pop',
            alignRight ? 'right-0' : 'left-0',
            'animate-scale-in',
          )}
        >
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-subtle">From</div>
              <DateField value={fromStr} onChange={setFromStr} />
              {fromStr.length === 10 && !fromValid && (
                <p className="mt-1 text-[10.5px] text-danger">That date doesn&rsquo;t exist.</p>
              )}
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-subtle">To</div>
              <DateField value={toStr} onChange={setToStr} />
              {toStr.length === 10 && !toValid && (
                <p className="mt-1 text-[10.5px] text-danger">That date doesn&rsquo;t exist.</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-b-subtle pt-2">
            <button
              type="button"
              onClick={clear}
              className="text-[11.5px] font-semibold text-subtle hover:text-text"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!fromValid || !toValid}
              className="text-[11.5px] font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Cbx({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={(ev) => { ev.stopPropagation(); onChange(); }}
      aria-checked={checked}
      role="checkbox"
      className={cn(
        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
        checked
          ? 'border-primary bg-primary text-white'
          : 'border-b-strong bg-surface text-transparent hover:border-primary',
      )}
    >
      <CheckIcon size={12} strokeWidth={3} />
    </button>
  );
}

/**
 * BulkBar — bulk-mutate the selected enquiries.
 *
 * Every button is wired: Reassign owner + Change status + Change priority
 * open a dropdown of choices and PATCH each selected id in parallel; Export
 * downloads a CSV of just the selected rows.
 */
function BulkBar({
  selectedIds,
  rows,
  onDone,
}: {
  selectedIds: number[];
  rows: EnquiryListItem[];
  onDone: () => void;
}) {
  const usersQ = useQuery({
    queryKey: ['users', 'list', 'bulk'],
    queryFn: () => endpoints.users.list({ page_size: 100 }),
  });
  const consultants = (usersQ.data?.results ?? []).filter((u) => u.is_active);
  const statusOptions = useMasterDataValues('status', STATUSES_FALLBACK);
  const typeOptions = useMasterDataValues('enquiry_type', TYPES_FALLBACK);

  const [busy, setBusy] = useState(false);

  const runAll = async (fn: (id: number) => Promise<unknown>) => {
    setBusy(true);
    try {
      await Promise.all(selectedIds.map(fn));
      onDone();
    } catch (err) {
      alert(`Bulk update failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (s: string) =>
    runAll((id) => endpoints.enquiries.changeStatus(id, s));
  const changePriority = (p: string) =>
    runAll((id) => endpoints.enquiries.patch(id, { enquiry_type: p as EnquiryListItem['enquiry_type'] }));
  const reassign = (owner: number) =>
    runAll((id) => endpoints.enquiries.reassign(id, owner));
  const exportSelected = () => {
    const set = new Set(selectedIds);
    exportEnquiriesCsv(rows.filter((r) => set.has(r.id)));
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-ink px-4 py-3 text-white shadow-card">
      <span className="text-[13px] font-semibold">
        <b className="font-display">{selectedIds.length}</b> selected
      </span>
      <SelbarPicker
        icon={<UsersIcon size={14} />}
        label="Reassign owner"
        disabled={busy || consultants.length === 0}
        options={consultants.map((u) => ({ value: String(u.id), label: u.name }))}
        onPick={(v) => reassign(Number(v))}
      />
      <SelbarPicker
        icon={<CheckIcon size={14} />}
        label="Change status"
        disabled={busy}
        options={statusOptions.map((s) => ({ value: s, label: s }))}
        onPick={changeStatus}
      />
      <SelbarPicker
        icon={<Star size={14} />}
        label="Change priority"
        disabled={busy}
        options={typeOptions.map((t) => ({ value: t, label: t }))}
        onPick={changePriority}
      />
      <SelbarBtn icon={<Download size={14} />} onClick={exportSelected} disabled={busy}>
        Export
      </SelbarBtn>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onDone}
        className="text-[12.5px] font-semibold text-white/70 hover:text-white"
      >
        Clear
      </button>
    </div>
  );
}

function SelbarPicker({
  icon,
  label,
  options,
  onPick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  options: Array<{ value: string; label: string }>;
  onPick: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (!ref.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <SelbarBtn icon={icon} onClick={() => setOpen((v) => !v)} disabled={disabled}>
        {label}
      </SelbarBtn>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-40 max-h-72 w-56 overflow-y-auto rounded-lg border border-b-subtle bg-surface p-1 shadow-pop animate-slide-up"
        >
          {options.length === 0 ? (
            <div className="px-2.5 py-2 text-[12px] text-subtle">No options.</div>
          ) : (
            options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onPick(o.value); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-text hover:bg-soft"
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SelbarBtn({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-white/10 px-[13px] py-2 text-[12.5px] font-semibold text-white',
        !disabled && 'hover:bg-white/20',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function PagerBtn({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-md border border-b-default bg-surface px-3 text-[12px] font-semibold text-text',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-soft',
      )}
    >
      {children}
    </button>
  );
}

void XIcon; // reserved for the active-filter row (may re-add later).

// -------------------- Export --------------------

function exportEnquiriesCsv(rows: EnquiryListItem[]) {
  if (!rows.length) return;
  const cols: Array<[string, (e: EnquiryListItem) => string]> = [
    ['Enquiry ID',       (e) => e.lead_id],
    ['Created',          (e) => e.created_at.slice(0, 10)],
    ['Company',          (e) => e.company_name],
    ['Industry',         (e) => e.industry],
    ['Contact person',   (e) => e.contact_name ?? ''],
    ['Designation',      (e) => e.contact_designation ?? ''],
    ['Phone',            (e) => fmtPhone(e.phone)],
    ['Email',            (e) => e.email],
    ['Enquiry source',   (e) => e.source],
    ['Enquiry type',     (e) => e.enquiry_type],
    ['Status',           (e) => e.status],
    ['Expected value',   (e) => String(e.expected_value)],
    // Exported alongside the raw figure, not instead of it — so a pivot can
    // group by band while the exact number stays available to sum.
    ['Deal size',        (e) => bandLabel(e.expected_value)],
    ['Expected closure', (e) => e.expected_close_date ?? ''],
    ['Owner',            (e) => e.owner_name ?? ''],
    ['Last activity',    (e) => e.updated_at],
  ];
  const csvCell = (v: string) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = cols.map((c) => csvCell(c[0])).join(',');
  const body = rows.map((e) => cols.map((c) => csvCell(c[1](e))).join(',')).join('\n');
  const csv = '﻿' + header + '\n' + body; // BOM so Excel picks up UTF-8
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `enquiries-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
