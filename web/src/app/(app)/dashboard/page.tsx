'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { Button } from '@/components/ui/Button';
import { useModals } from '@/components/shell/ModalHost';
import { endpoints } from '@/lib/api/endpoints';
import { session } from '@/lib/auth/session';
import { periodStartISO } from '@/lib/utils/date';
import { KpiStrip } from '@/components/dashboard/KpiStrip';
import { Reveal } from '@/components/ui/Reveal';
import { ConversionFunnel } from '@/components/dashboard/ConversionFunnel';
import {
  EnquiriesByMonth,
  PipelineTrend,
  EnquirySource,
  WonVsLost,
} from '@/components/dashboard/Charts';
import {
  StalledDeals,
  MyQueue,
  RecentActivity,
  TeamPerformance,
  TopIndustries,
  WhyWeLose,
} from '@/components/dashboard/SidePanels';

/**
 * Dashboard — matches the Enterprise CRM mockup's `#m-dash` layout.
 *
 *   ┌────────────────────────────────────────────┐
 *   │              6 KPI cards (staggered)        │
 *   ├─────────────────────────────┬──────────────┤
 *   │  Stalled deals              │  Why we lose │
 *   │  Conversion funnel          │  My Queue    │
 *   │  Enquiries×month · Pipeline │  Recent act. │
 *   │  Enquiry source · Won/Lost  │  Team perf.  │
 *   └─────────────────────────────┴──────────────┘
 *
 * Data:
 * - `GET /api/dashboard/` for KPIs + by_stage + by_consultant (admin).
 * - `GET /api/enquiries/?page_size=200` for the client-side computed views:
 *   stalled-deals table, monthly-count bars, pipeline-trend area, source
 *   donut, recent-activity feed, my-queue. Runs in parallel with dashboard.
 *
 * Role scoping is server-enforced — DRF's EnquiryViewSet.get_queryset scopes
 * consultants to their own rows and gives admins everything.
 */
const PERIODS = [
  { key: '', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'Month' },
] as const;

export default function DashboardPage() {
  const user = session.getUser();
  const isAdmin = user?.role === 'admin';
  const first = (user?.name ?? 'there').split(' ')[0];
  const modals = useModals();
  // '' = all-time. Backed by /api/dashboard/?period= — KPI strip,
  // funnel, Why-we-lose and Team performance all narrow with it.
  const [period, setPeriod] = useState<string>('');

  const dashQ = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => endpoints.dashboard(period || undefined),
  });
  const enqQ = useQuery({
    queryKey: ['enquiries', 'list', { page_size: 100 }],
    queryFn: () => endpoints.enquiries.list({ page_size: 100 }),
  });
  // Recent Activity is the one side-panel where "narrow to this period"
  // is actually the right question ("what happened recently, in this
  // window") — date_from mirrors the exact same bucket /dashboard/?period=
  // uses, so it and the KPI strip above it never disagree.
  const recentQ = useQuery({
    queryKey: ['enquiries', 'list', 'recent', period],
    queryFn: () => endpoints.enquiries.list({ page_size: 100, date_from: periodStartISO(period) }),
  });
  // Server-computed side-panel slices — cover the whole dataset, unlike
  // the general 100-row sample above. Deliberately NOT period-scoped:
  // Stalled Deals ("neglected right now") and My Queue ("closing soon")
  // are both about current/forward-looking state, not "created in this
  // window" — filtering them by period would hide genuinely-stalled old
  // deals instead of clarifying anything. Their card subtitles say so.
  const stalledQ = useQuery({
    queryKey: ['enquiries', 'stalled'],
    queryFn: () => endpoints.enquiries.list({ stalled: 1, page_size: 20 }),
  });
  const queueQ = useQuery({
    queryKey: ['enquiries', 'queue-mine'],
    queryFn: () => endpoints.enquiries.list({ queue: 'mine', page_size: 20 }),
  });

  const loading = dashQ.isLoading || enqQ.isLoading;
  const error = (dashQ.error || enqQ.error) as Error | null;
  const dashboard = dashQ.data;
  const enquiries = enqQ.data?.results ?? [];
  const recentEnquiries = recentQ.data?.results ?? enquiries;

  const wonCount = dashboard?.by_stage?.find((r) => r.status === 'Won')?.count ?? 0;
  const lostCount = dashboard?.by_stage?.find((r) => r.status === 'Lost')?.count ?? 0;

  return (
    <>
      <SectionHeader
        title={`Good morning, ${first}`}
        subtitle="Your team's pipeline at a glance."
        actions={
          <Button leftIcon={<Plus size={15} />} onClick={() => modals.open('newEnquiry')}>
            New Enquiry
          </Button>
        }
      />

      <div className="w-full px-3 pt-3 pb-5 xl:px-4">
        {error && (
          <div className="mb-[14px] rounded-md bg-danger-soft p-4 text-sm text-danger">
            Couldn&rsquo;t load the dashboard: {error.message}
          </div>
        )}

        {/* Period chips — mirror the mobile mockup's fchips; stay mounted
            across refetches so switching periods doesn't lose the control. */}
        <div className="mb-[14px] flex flex-wrap gap-[6px]">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                'rounded-full border px-[13px] py-[6px] text-[12px] font-semibold transition-colors duration-fast',
                period === p.key
                  ? 'border-text bg-text text-surface'
                  : 'border-b-default bg-surface text-muted hover:text-text',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loading || !dashboard ? (
          <DashboardSkeleton />
        ) : (
          <>
            <KpiStrip data={dashboard} />

            {/* Two-column layout — 2fr left / 1fr right on desktop, stack on mobile.
                Gap/margin scale is 14px throughout to match the mockup's rhythm. */}
            {/* Each card reveals as it scrolls into view, entering from the
                direction of travel. Small stagger between side-by-side pairs
                so a row arrives as a sequence rather than a flash. The KPI
                strip above is deliberately NOT wrapped — it's above the fold
                and already has its own load stagger. */}
            <div className="mt-[14px] grid grid-cols-1 gap-[14px] xl:grid-cols-3">
              <div className="space-y-[14px] xl:col-span-2">
                <Reveal><StalledDeals enquiries={stalledQ.data?.results ?? []} /></Reveal>
                <Reveal><ConversionFunnel data={dashboard} /></Reveal>
                <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
                  <Reveal><EnquiriesByMonth enquiries={enquiries} /></Reveal>
                  <Reveal delay={70}><PipelineTrend enquiries={enquiries} /></Reveal>
                </div>
                <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
                  <Reveal><EnquirySource enquiries={enquiries} /></Reveal>
                  <Reveal delay={70}>
                    <WonVsLost
                      wonCount={wonCount}
                      lostCount={lostCount}
                      wonValue={Number(dashboard.won_value || 0)}
                    />
                  </Reveal>
                </div>
              </div>

              {/* Right column — a flex column so the last card (Top Industries)
                  can `flex-1` and soak up whatever height is left after the
                  fixed-content cards above it, keeping the two columns
                  vertically balanced. */}
              <div className="flex flex-col gap-[14px]">
                <Reveal><WhyWeLose data={dashboard} /></Reveal>
                <Reveal><MyQueue enquiries={queueQ.data?.results ?? []} /></Reveal>
                <Reveal><RecentActivity enquiries={recentEnquiries} /></Reveal>
                {isAdmin && <Reveal><TeamPerformance data={dashboard} /></Reveal>}
                <Reveal><TopIndustries enquiries={enquiries} /></Reveal>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** Loading skeleton — matches the KPI + two-column structure. */
function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-[14px]">
      <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[96px] rounded-card border border-b-subtle bg-soft" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-[14px] xl:grid-cols-3">
        <div className="space-y-[14px] xl:col-span-2">
          <div className="h-56 rounded-card border border-b-subtle bg-soft" />
          <div className="h-56 rounded-card border border-b-subtle bg-soft" />
          <div className="grid grid-cols-2 gap-[14px]">
            <div className="h-52 rounded-card border border-b-subtle bg-soft" />
            <div className="h-52 rounded-card border border-b-subtle bg-soft" />
          </div>
        </div>
        <div className="space-y-[14px]">
          <div className="h-40 rounded-card border border-b-subtle bg-soft" />
          <div className="h-56 rounded-card border border-b-subtle bg-soft" />
          <div className="h-56 rounded-card border border-b-subtle bg-soft" />
        </div>
      </div>
    </div>
  );
}
