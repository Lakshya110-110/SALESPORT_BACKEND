'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { EnquiryListItem } from '@/lib/api/types';
import { fmtInrShort } from '@/lib/utils/format';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const OPEN_STATUSES = new Set<string>([
  'Enquiry',
  'Qualified',
  'Meeting Scheduled',
  'Proposal Sent',
  'Negotiation',
]);

const CHART_H = 148;

type WeekBin = { label: string; count: number; value: number };

/** Start-of-week (Monday) for a date, stripped of time. */
function startOfWeek(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = c.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  c.setDate(c.getDate() + diff);
  return c;
}

/**
 * Bin enquiries into the last `weeks` weeks (Mon-anchored). Returns one entry
 * per week, oldest first, with a "MMM d" label. When `predicate` is supplied
 * only matching enquiries contribute; `value` accumulates `expected_value`.
 */
function binByWeek(
  enquiries: EnquiryListItem[],
  weeks: number,
  predicate?: (e: EnquiryListItem) => boolean,
): WeekBin[] {
  const thisMonday = startOfWeek(new Date());
  const bins: WeekBin[] = [];
  const idx = new Map<number, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const m = new Date(thisMonday);
    m.setDate(m.getDate() - i * 7);
    idx.set(m.getTime(), bins.length);
    bins.push({ label: `${MONTH[m.getMonth()]} ${m.getDate()}`, count: 0, value: 0 });
  }
  enquiries.forEach((e) => {
    if (predicate && !predicate(e)) return;
    const d = new Date(e.created_at);
    if (isNaN(d.getTime())) return;
    const key = startOfWeek(d).getTime();
    const b = idx.get(key);
    if (b === undefined) return;
    bins[b].count += 1;
    bins[b].value += Number(e.expected_value) || 0;
  });
  return bins;
}

/**
 * Enquiries by week — bar chart, last 8 weeks (Mon-anchored). Bars use
 * `--primary` with a rounded top cap to match §16 chart palette and the
 * mockup's `.bars .bar` style. Falls back to an empty state when the range
 * is too sparse to be useful (< 2 non-zero weeks) — with our seed data all
 * in the current ISO week that means the empty state fires today, which is
 * accurate.
 */
export function EnquiriesByMonth({ enquiries }: { enquiries: EnquiryListItem[] }) {
  const data = useMemo(() => binByWeek(enquiries, 8), [enquiries]);
  const nonZero = useMemo(() => data.filter((b) => b.count > 0).length, [data]);

  return (
    <ChartCard title="Enquiries by week" subtitle="Last 8 weeks">
      {nonZero < 2 ? (
        <EmptyChart message="Not enough history yet" />
      ) : (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="var(--b-subtle)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--subtle)', fontSize: 11 }}
              interval={0}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--subtle)', fontSize: 11 }}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: 'var(--soft)' }}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--b-subtle)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text)',
                boxShadow: 'var(--sh-card)',
              }}
              labelStyle={{ color: 'var(--muted)' }}
              itemStyle={{ color: 'var(--text)' }}
              formatter={(v: number) => [v, 'enquiries']}
            />
            <Bar
              dataKey="count"
              fill="var(--bar2)"
              radius={[7, 7, 0, 0]}
              maxBarSize={22}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/**
 * Pipeline trend — smooth area of weekly open-pipeline value, last 8 weeks.
 * `cursor={false}` on the tooltip removes the persistent crosshair line
 * that recharts otherwise leaves anchored to the last hovered point. With
 * only one non-zero week we render the empty state instead of a lone spike
 * plus a vertical cliff.
 */
export function PipelineTrend({ enquiries }: { enquiries: EnquiryListItem[] }) {
  const data = useMemo(
    () => binByWeek(enquiries, 8, (e) => OPEN_STATUSES.has(e.status)),
    [enquiries],
  );
  const nonZero = useMemo(() => data.filter((b) => b.value > 0).length, [data]);

  return (
    <ChartCard title="Pipeline trend" subtitle="Open value · Last 8 weeks">
      {nonZero < 2 ? (
        <EmptyChart message="Trend needs a few weeks of data" />
      ) : (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="pip-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--bar2)" stopOpacity={0.22} />
                <stop offset="1" stopColor="var(--bar2)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--b-subtle)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--subtle)', fontSize: 11 }}
              interval={0}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--subtle)', fontSize: 10 }}
              tickFormatter={(v) => fmtInrShort(v)}
              width={44}
            />
            <Tooltip
              cursor={false}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--b-subtle)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text)',
                boxShadow: 'var(--sh-card)',
              }}
              labelStyle={{ color: 'var(--muted)' }}
              itemStyle={{ color: 'var(--text)' }}
              formatter={(v: number) => [fmtInrShort(v), 'open value']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--bar2)"
              strokeWidth={2.5}
              fill="url(#pip-grad)"
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--bar2)' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/**
 * Enquiry source donut — top-3 sources plus "Other", DS series order
 * (primary → accent → warning → info per §16). Thinner ring than the mockup
 * for the enterprise-CRM feel called out in the review.
 */
export function EnquirySource({ enquiries }: { enquiries: EnquiryListItem[] }) {
  const { data, total } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of enquiries) {
      const key = e.source || 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 3);
    const otherCount = entries.slice(3).reduce((a, [, v]) => a + v, 0);
    return {
      total: enquiries.length,
      data: [
        ...top.map(([name, value]) => ({ name, value })),
        ...(otherCount > 0 ? [{ name: 'Other', value: otherCount }] : []),
      ],
    };
  }, [enquiries]);
  // Mockup source-donut palette: bar3 (deep navy) → bar2 (primary) → bar1 (light) → soft-blue for "Other".
  const colors = ['var(--bar3)', 'var(--bar2)', 'var(--bar1)', '#A9C0EC'];

  return (
    <ChartCard title="Enquiry source" subtitle="Where your enquiries come from">
      {total === 0 ? (
        <EmptyChart message="No enquiries yet" />
      ) : (
        <DonutRow>
          <Donut
            data={data}
            colors={colors}
            centerTop={String(total)}
            centerBottom="enquiries"
          />
          {/* CSS-grid legend (`li` as `contents` so its 3 children become
              direct grid items) — the label column auto-sizes to the
              longest label in THIS list, so it hugs "Exhibition" as
              tightly as it would hug "Won"/"Lost" elsewhere, instead of a
              one-size-fits-all fixed width leaving dead space in short
              rows. */}
          <ul
            className="grid min-w-0 items-center gap-x-2 gap-y-1.5 text-[11.5px]"
            style={{ gridTemplateColumns: 'auto auto auto' }}
          >
            {data.map((d, i) => (
              <li key={d.name} className="contents">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: colors[i % colors.length] }}
                />
                <span className="truncate text-muted">{d.name}</span>
                <span className="tabular-nums text-subtle">
                  {Math.round((d.value / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </DonutRow>
      )}
    </ChartCard>
  );
}

/** Won vs Lost donut — matches EnquirySource sizing/weight. */
export function WonVsLost({
  wonCount,
  lostCount,
  wonValue,
}: {
  wonCount: number;
  lostCount: number;
  wonValue: number;
}) {
  const total = wonCount + lostCount;
  const winRate = total > 0 ? Math.round((wonCount / total) * 100) : 0;
  const data = [
    { name: 'Won', value: wonCount, fill: 'var(--success)' },
    { name: 'Lost', value: lostCount, fill: 'var(--danger)' },
  ];

  return (
    <ChartCard title="Won vs Lost" subtitle="This period">
      {total === 0 ? (
        <EmptyChart message="No closed deals yet" />
      ) : (
        <DonutRow>
          <Donut
            data={data}
            colors={data.map((d) => d.fill)}
            centerTop={`${winRate}%`}
            centerBottom="win rate"
          />
          <ul
            className="grid min-w-0 items-center gap-x-2 gap-y-1.5 text-[11.5px]"
            style={{ gridTemplateColumns: 'auto auto auto' }}
          >
            <li className="contents">
              <span className="inline-block h-2 w-2 shrink-0 rounded-sm bg-success" />
              <span className="truncate text-muted">Won</span>
              <span className="tabular-nums text-subtle">
                {wonCount} · {fmtInrShort(wonValue)}
              </span>
            </li>
            <li className="contents">
              <span className="inline-block h-2 w-2 shrink-0 rounded-sm bg-danger" />
              <span className="truncate text-muted">Lost</span>
              <span className="tabular-nums text-subtle">{lostCount}</span>
            </li>
          </ul>
        </DonutRow>
      )}
    </ChartCard>
  );
}

// ---- shared bits ----

function DonutRow({ children }: { children: React.ReactNode }) {
  // Centered — the donut+legend pair is a compact fixed-width block that
  // doesn't scale with the card, so left-aligning it dumped all the
  // leftover width as dead space on the right. Centering spreads it evenly
  // on both sides instead, reading as intentional breathing room.
  return <div className="flex items-center justify-center gap-6">{children}</div>;
}

/**
 * A 128px donut with a 14px ring — smaller and thinner than the mockup
 * (~40px ring at 142px) per the review note, still large enough for the
 * centred figure to read at glance.
 */
function Donut({
  data,
  colors,
  centerTop,
  centerBottom,
}: {
  data: { name: string; value: number }[];
  colors: string[];
  centerTop: string;
  centerBottom: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    // `overflow-visible` lets the tooltip escape the 128 × 128 donut viewbox
    // — otherwise recharts renders it inside the container and it either
    // gets clipped or forces the donut itself to shift on hover.
    <div className="relative h-32 w-32 shrink-0 overflow-visible">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ zIndex: 50, pointerEvents: 'none' }}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--b-subtle)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
              color: 'var(--text)',
              boxShadow: 'var(--sh-card)',
              whiteSpace: 'nowrap',
            }}
            labelStyle={{ color: 'var(--muted)' }}
            itemStyle={{ color: 'var(--text)', padding: 0 }}
            formatter={(v: number, name: string) => [
              `${v} · ${total > 0 ? Math.round((v / total) * 100) : 0}%`,
              name,
            ]}
          />
          <Pie
            data={data}
            dataKey="value"
            innerRadius={46}
            outerRadius={60}
            paddingAngle={data.length > 1 ? 1 : 0}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-display text-[17px] font-bold leading-none text-text">
          {centerTop}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-wider text-subtle">
          {centerBottom}
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  // Power-BI-style card hover: subtle lift + stronger shadow + a hint of the
  // primary colour on the border. Cheap on paint (transform + box-shadow +
  // border-colour only, all GPU-friendly) and reads as "this thing is
  // interactive" without the noise of a full outline highlight.
  return (
    <div className="rounded-card border border-b-subtle bg-surface p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-pop">
      <div className="font-display text-[13px] font-semibold text-text">{title}</div>
      <div className="mb-3 text-[11.5px] text-subtle">{subtitle}</div>
      {children}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed border-b-default bg-soft px-4 text-center text-[12px] text-subtle"
      style={{ height: CHART_H }}
    >
      {message}
    </div>
  );
}
