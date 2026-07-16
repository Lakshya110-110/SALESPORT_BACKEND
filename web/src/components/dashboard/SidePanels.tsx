'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, Phone, Calendar, FileText, Factory } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { fmtInrShort, initials, avatarColor, ddmm, timeAgo } from '@/lib/utils/format';
import { bandLabel } from '@/lib/utils/valueBand';
import { todayLocalISO } from '@/lib/utils/date';
import type { Dashboard, EnquiryListItem } from '@/lib/api/types';

/**
 * Stalled deals — enquiries that have been sitting in the same stage past a
 * threshold. Computed client-side from the enquiries list until the backend
 * exposes a dedicated endpoint. Same visual as the mockup's `.card` + table.
 */
const OPEN = new Set(['New', 'In Progress']);

/** Days since an ISO timestamp; returns null when the timestamp is
 *  missing so the caller can render a distinct "never" pill. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function StalledDeals({ enquiries }: { enquiries: EnquiryListItem[] }) {
  // Selection + ordering now happen server-side (`/enquiries/?stalled=1`
  // → open deals untouched ≥3 days, stalest first, across the WHOLE
  // dataset). This component only decorates each row with its age.
  const rows = useMemo(() => {
    const now = Date.now();
    return enquiries.map((e) => {
      const age = Math.floor((now - new Date(e.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      return { e, age };
    });
  }, [enquiries]);

  return (
    <div
      className="flex flex-col rounded-card border border-b-subtle bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-pop"
      style={{ height: 420 }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-b-subtle px-5 py-3">
        <h3 className="font-display text-[15px] font-semibold text-text">Stalled deals</h3>
        {/* Deliberately not period-scoped — a deal neglected since last
            month is still neglected regardless of the "Today" chip above,
            so this always covers the whole dataset. Said explicitly so it
            doesn't read as disagreeing with the (period-scoped) KPIs. */}
        <span className="text-[11.5px] text-subtle">Sitting too long in stage · All time</span>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] text-subtle">
          No stalled deals right now — every open enquiry moved this week.
        </div>
      ) : (
        <div className="sp-scroll min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed text-[12.5px]">
            {/* Explicit column widths so cells stop competing — the
                Company column gets the slack, everything else is sized
                to its content. */}
            <colgroup>
              <col style={{ width: '30%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-soft">
              <tr className="text-left">
                <Th>Company / Enquiry</Th>
                <Th>Stage</Th>
                <Th>Owner</Th>
                <Th>Age</Th>
                <Th>Since touch</Th>
                <Th className="text-right">Value</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, age }) => {
                const sinceTouch = daysSince(e.last_touch_at);
                return (
                <tr key={e.id} className="border-t border-b-subtle hover:bg-soft">
                  <Td>
                    <Link href={`/enquiries/${e.id}`} className="block min-w-0">
                      <div className="truncate font-semibold text-text">{e.company_name}</div>
                      <div className="truncate font-mono text-[10.5px] text-subtle">{e.lead_id}</div>
                    </Link>
                  </Td>
                  <Td>
                    <span className="inline-block max-w-full truncate whitespace-nowrap rounded-sm bg-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">
                      {e.status}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: avatarColor(e.owner_name) }}
                      >
                        {initials(e.owner_name)}
                      </span>
                      <span className="min-w-0 truncate text-muted">{e.owner_name ?? '—'}</span>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-warning">
                      {age}d
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {sinceTouch === null ? (
                      <span className="rounded-sm bg-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-subtle">
                        never
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold',
                          sinceTouch >= 7
                            ? 'bg-danger-soft text-danger'
                            : sinceTouch >= 3
                            ? 'bg-warning-soft text-warning'
                            : 'bg-success-soft text-success',
                        )}
                      >
                        {sinceTouch}d
                      </span>
                    )}
                  </Td>
                  {/* The band, not the stored figure — that figure is the
                      midpoint of the band picked at entry, not a quoted price. */}
                  <Td className="whitespace-nowrap text-right">{bandLabel(e.expected_value)}</Td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'bg-soft px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-subtle',
        className,
      )}
    >
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-2.5 align-middle', className)}>{children}</td>;
}

/** My Queue — the signed-in user's follow-ups due. Selection is server-side
 *  (`/enquiries/?queue=mine` → own open deals whose latest touchpoint set a
 *  next_action_date that's overdue or within 7 days, soonest first); this
 *  just renders the rows. Log a follow-up date on Log Touchpoint to add one. */
export function MyQueue({ enquiries }: { enquiries: EnquiryListItem[] }) {
  const soon = enquiries.slice(0, 20);

  return (
    <div className="rounded-card border border-b-subtle bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-pop">
      <div className="flex items-center justify-between border-b border-b-subtle px-5 py-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-text">My Queue</h3>
          {/* Not period-scoped — a follow-up due date is forward-looking, not
              tied to when the deal was created. */}
          <span className="text-[10.5px] text-subtle">Follow-ups due</span>
        </div>
        <Link href="/enquiries" className="text-[11.5px] font-semibold text-primary hover:underline">
          View all
        </Link>
      </div>
      <div className="sp-scroll max-h-[252px] overflow-y-auto p-1">
        {soon.length === 0 ? (
          <div className="px-5 py-6 text-center text-[12.5px] text-subtle">
            No follow-ups due. Set a follow-up date when you log a touchpoint.
          </div>
        ) : (
          soon.map((e) => {
            const overdue = e.next_followup_at ? e.next_followup_at < todayLocalISO() : false;
            return (
            <Link
              key={e.id}
              href={`/enquiries/${e.id}`}
              className="flex items-center gap-3 rounded-md px-4 py-3 hover:bg-soft"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Phone size={16} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-text">
                  Follow up — {e.company_name}
                </div>
                <div className="truncate text-[11.5px] text-subtle">
                  {e.status} · {e.lead_id}
                </div>
              </div>
              <div className={cn('whitespace-nowrap text-[11px] font-semibold', overdue ? 'text-danger' : 'text-muted')}>
                {overdue ? 'Overdue · ' : ''}{ddmm(e.next_followup_at)}
              </div>
            </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Recent Activity — the 4 most-recently-updated enquiries as a rough
 *  team-wide activity feed. */
export function RecentActivity({ enquiries }: { enquiries: EnquiryListItem[] }) {
  const rows = useMemo(
    () => enquiries
      .slice()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 20),
    [enquiries],
  );

  return (
    <div className="rounded-card border border-b-subtle bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-pop">
      <div className="flex items-center justify-between border-b border-b-subtle px-5 py-3">
        <h3 className="font-display text-[15px] font-semibold text-text">Recent Activity</h3>
        <Link href="/enquiries" className="text-[11.5px] font-semibold text-primary hover:underline">
          View all
        </Link>
      </div>
      <div className="sp-scroll max-h-[252px] overflow-y-auto p-1">
        {rows.length === 0 ? (
          <div className="px-5 py-6 text-center text-[12.5px] text-subtle">
            No recent activity yet.
          </div>
        ) : (
          rows.map((e) => {
            const [icon, tone] = iconFor(e.status);
            return (
              <Link
                key={e.id}
                href={`/enquiries/${e.id}`}
                className="flex items-center gap-3 rounded-md px-4 py-3 hover:bg-soft"
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                    tone,
                  )}
                >
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-text">
                    {e.owner_name ?? 'Someone'} · {e.status} — {e.company_name}
                  </div>
                  <div className="truncate text-[11.5px] text-subtle">
                    {bandLabel(e.expected_value)}
                  </div>
                </div>
                <div className="whitespace-nowrap text-[11px] text-subtle">
                  {timeAgo(e.updated_at)}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function iconFor(status: string): [React.ReactNode, string] {
  if (status === 'Won') return [<CheckIcon key="w" />, 'bg-success-soft text-success'];
  if (status === 'Lost') return [<AlertTriangle key="l" size={16} />, 'bg-danger-soft text-danger'];
  if (status === 'Spam') return [<AlertTriangle key="s" size={16} />, 'bg-sunken text-muted'];
  if (status === 'In Progress') return [<FileText key="p" size={16} />, 'bg-warning-soft text-warning'];
  return [<Phone key="c" size={16} />, 'bg-info-soft text-info'];
}
function CheckIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/** Team performance — admin only. Uses dashboard.by_consultant. */
export function TeamPerformance({ data }: { data: Dashboard }) {
  const rows = data.by_consultant ?? [];
  const max = rows.length > 0 ? Math.max(...rows.map((r) => r.count)) : 1;

  return (
    <div className="rounded-card border border-b-subtle bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-pop">
      <div className="flex items-center justify-between border-b border-b-subtle px-5 py-3">
        <h3 className="font-display text-[15px] font-semibold text-text">Team performance</h3>
        <span className="text-[11.5px] text-subtle">This period</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12.5px] text-subtle">
          No enquiries logged by the team yet.
        </div>
      ) : (
      <div className="sp-scroll max-h-[164px] space-y-3 overflow-y-auto px-5 py-4">
        {rows.map((r) => {
          const name = r.owner__name ?? 'Unassigned';
          const pct = max > 0 ? Math.round((r.count / max) * 100) : 0;
          return (
            <div key={name} className="flex items-center gap-3 text-[12px]">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: avatarColor(name) }}
              >
                {initials(name)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-text">{name}</span>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-soft">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.max(6, pct)}%` }}
                />
              </div>
              <span className="w-24 text-right font-mono text-[11px] text-subtle">
                {r.count} enquiries
              </span>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

/**
 * Why we lose — bar list of loss reasons, matching the mockup's `.wl` card.
 * Fed by `dashboard.by_lost_reason` (grouped counts of Lost enquiries whose
 * `lost_reason` field is populated). Falls back to an empty state when the
 * team hasn't captured any reasons yet — no more mock numbers.
 */
const REASON_ORDER = [
  'Price',
  'Competitor',
  'No budget',
  'Timing',
  'No response',
  'Feature gap',
  'Went in-house',
  'Other',
] as const;
const REASON_LABEL: Record<string, string> = {
  Price: 'Price too high',
  Competitor: 'Chose competitor',
  'No budget': 'No budget / deferred',
  Timing: 'Timing',
  'No response': 'No response',
  'Feature gap': 'Missing capability',
  'Went in-house': 'Built in-house',
  Other: 'Other',
};

export function WhyWeLose({ data }: { data?: Dashboard }) {
  const raw = data?.by_lost_reason ?? [];
  // Order by REASON_ORDER for a stable UI even as counts shift.
  const rows = REASON_ORDER
    .map((r) => ({ label: REASON_LABEL[r], count: raw.find((x) => x.lost_reason === r)?.count ?? 0 }))
    .filter((r) => r.count > 0);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = rows.length > 0 ? Math.max(...rows.map((r) => r.count)) : 1;

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-b-subtle bg-surface p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div className="font-display text-[13px] font-semibold text-text">Why we lose</div>
          <span className="text-[11px] text-subtle">0 lost this quarter</span>
        </div>
        <div className="mt-0.5 text-[12px] text-subtle">Loss reasons this quarter</div>
        <div className="mt-4 rounded-md border border-dashed border-b-default bg-soft/60 px-4 py-6 text-center text-[12px] text-subtle">
          No lost enquiries have a reason recorded yet.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-b-subtle bg-surface p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div className="font-display text-[13px] font-semibold text-text">Why we lose</div>
        <span className="text-[11px] text-subtle">{total} lost this quarter</span>
      </div>
      <div className="mt-0.5 text-[12px] text-subtle">Loss reasons this quarter</div>
      {/* Capped tall enough for ~5 reasons with internal scroll for the rest,
          same reasoning as Top Industries below it — otherwise this card's
          height swings with however many loss reasons the team has actually
          recorded, throwing off the vertical balance of the whole column. */}
      <div className="sp-scroll mt-4 max-h-[118px] space-y-2.5 overflow-y-auto pr-1">
        {rows.map((r) => {
          const pct = Math.round((r.count / max) * 100);
          return (
            <div
              key={r.label}
              className="flex items-center gap-3 rounded-md px-1 py-0.5 transition-colors hover:bg-soft"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text">
                {r.label}
              </span>
              <div className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-soft">
                <div
                  className="h-full rounded-full bg-danger opacity-85"
                  style={{ width: `${Math.max(8, pct)}%` }}
                />
              </div>
              <span className="w-6 text-right font-mono text-[11.5px] font-semibold text-muted">
                {r.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Top Industries — ranks industries by open-enquiry count with a value bar.
 * The card sizes to its content: previously it was `flex-1` inside a `flex-1`
 * body with `justify-around` on the rows, which spread 4–6 rows across the
 * whole leftover column height, producing enormous floating gaps that read
 * as a rendering glitch. Rows now stack at a fixed rhythm at the top.
 */
export function TopIndustries({ enquiries }: { enquiries: EnquiryListItem[] }) {
  const rows = useMemo(() => {
    const byIndustry: Record<string, { count: number; value: number }> = {};
    for (const e of enquiries) {
      if (!OPEN.has(e.status)) continue;
      const key = e.industry || 'Uncategorised';
      if (!byIndustry[key]) byIndustry[key] = { count: 0, value: 0 };
      byIndustry[key].count += 1;
      byIndustry[key].value += Number(e.expected_value) || 0;
    }
    return Object.entries(byIndustry)
      .map(([label, r]) => ({ label, ...r }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [enquiries]);
  const maxCount = rows[0]?.count ?? 1;

  const totalOpen = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="rounded-card border border-b-subtle bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-pop">
      <div className="flex items-center justify-between border-b border-b-subtle px-5 py-3">
        <h3 className="font-display text-[15px] font-semibold text-text">Top Industries</h3>
        <span className="text-[11.5px] text-subtle">Open pipeline mix</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12.5px] text-subtle">
          No open enquiries to break down yet.
        </div>
      ) : (
        <div className="px-5 py-4">
          {/* Column headers mirror the 5-cell shape of every data row so each
              header sits exactly above its column. The first cell is a
              7×7 icon in the data row; the header pairs it with an empty
              spacer of matching width so the "Industry" heading lines up
              with the industry name (not shifted right by icon + gap). */}
          <div className="mb-2 flex items-center gap-3 border-b border-b-subtle pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
            <span className="h-7 w-7 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">Industry</span>
            <span className="w-24 shrink-0 text-center">Share</span>
            <span className="w-20 shrink-0 text-right">Pipeline</span>
            <span className="w-8 shrink-0 text-right">Open</span>
          </div>
          {/* Rows stack top-anchored with a fixed 10 px gap. Each row is
              min-h-9 so short-label rows don't collapse smaller than the
              icon tile — keeps vertical rhythm predictable regardless of
              how many industries survive the top-6 cut.
              `group/top` powers the same Power-BI-style cross-highlight
              as the funnel: hovering one row dims the rest.
              Capped to ~4 rows tall (4 × 36px row + 3 × 10px gap) with
              internal scroll for the rest — otherwise this card could grow
              taller than every other card on the page once industries fill
              out past a handful. */}
          <ul
            className="sp-scroll group/top flex max-h-[174px] flex-col gap-[10px] overflow-y-auto pr-1"
          >
            {rows.map((r) => {
              const pct = Math.round((r.count / maxCount) * 100);
              const share = totalOpen > 0 ? Math.round((r.count / totalOpen) * 100) : 0;
              return (
                <li
                  key={r.label}
                  title={`${r.label} · ${r.count} open · ${fmtInrShort(r.value)} pipeline · ${share}% of open enquiries`}
                  className={cn(
                    'flex min-h-9 cursor-default items-center gap-3 rounded-md -mx-1 px-1 text-[12px] transition-opacity duration-150',
                    'group-hover/top:opacity-40 hover:!opacity-100',
                  )}
                >
                  {/* Icon tile: primary-blue tint at 18% opacity so it reads
                      as "hint of blue" on both light and pure-black surfaces.
                      The old `bg-primary-soft` collapsed to #131A2F on dark
                      → an invisible black square, hence the inline colour. */}
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{ background: 'rgba(91, 123, 232, 0.18)', color: '#5B7BE8' }}
                  >
                    <Factory size={14} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-text">{r.label}</span>
                  {/* Bar: `--b-default` track reads on both light
                      (#E2E7EF on white) and dark (#2A2A2A on black) cards.
                      Fill is hard-coded primary blue so it doesn't drift
                      with the token. */}
                  <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-b-default">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(8, pct)}%`, background: '#5B7BE8' }}
                    />
                  </div>
                  <span className="w-20 shrink-0 whitespace-nowrap text-right font-mono text-[11px] text-subtle">
                    {fmtInrShort(r.value)}
                  </span>
                  <span className="w-8 shrink-0 text-right font-mono tabular-nums text-[11.5px] font-semibold text-muted">
                    {r.count}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
