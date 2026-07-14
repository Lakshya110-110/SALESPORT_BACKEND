'use client';

import { cn } from '@/lib/utils/cn';
import type { Dashboard } from '@/lib/api/types';

const STAGE_ORDER = [
  'New',
  'In Progress',
  'Won',
  'Lost',
  'Spam',
];

const STAGE_LABELS: Record<string, string> = {
  New: 'New',
  'In Progress': 'In Progress',
  Won: 'Won',
  Lost: 'Lost',
  Spam: 'Spam',
};

// Hard-coded hex per stage so the funnel reads the same on light and the
// all-black dark theme. `--navy` collapses to near-black in dark mode, so
// the "Proposal Sent" bar was disappearing against the black canvas —
// pinning the palette here keeps every stage distinct regardless of theme.
const STAGE_COLOR: Record<string, string> = {
  New: '#6E8BD6',                 // entry blue
  'In Progress': '#C77A12',       // warning amber — mirrors status pill tone
  Won: '#1F9D5B',                 // success green
  Lost: '#D14343',                // danger red
  Spam: '#8A8F98',                // muted grey
};

/**
 * Conversion funnel — horizontal bars per stage, sized as a % of the total
 * enquiry count. Mirrors the mockup's `.funnel > .fr > .fbar` visual.
 */
export function ConversionFunnel({ data }: { data: Dashboard }) {
  const byStage: Record<string, number> = {};
  (data.by_stage || []).forEach((r) => {
    byStage[r.status] = r.count;
  });

  const anyData = STAGE_ORDER.some((s) => (byStage[s] || 0) > 0);
  // Scale each bar against the LARGEST stage so the widest bar fills the
  // card. Total-based scaling made every bar look small when the funnel
  // was long — the top stage was ~40% of total leaving 60% blank.
  const maxCount = Math.max(1, ...STAGE_ORDER.map((s) => byStage[s] || 0));
  const totalAll = STAGE_ORDER.reduce((s, k) => s + (byStage[k] || 0), 0);

  return (
    <div className="rounded-card border border-b-subtle bg-surface p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-pop">
      <div className="font-display text-[13px] font-semibold text-text">Conversion funnel</div>
      <div className="mt-0.5 text-[12px] text-subtle">
        Enquiries by stage, through to won &amp; lost
      </div>

      {!anyData ? (
        <div className="mt-4 flex h-32 items-center justify-center rounded-md border border-dashed border-b-default bg-soft text-[12px] text-subtle">
          No enquiries yet — the funnel fills in as leads land.
        </div>
      ) : (
        // group/funnel enables Power-BI-style cross-highlight: while the
        // funnel is hovered, every row dims to 40 %; the row actually under
        // the cursor overrides itself back to 100 % so it pops out of the
        // dim field.
        <div className="group/funnel mt-4 space-y-3">
          {STAGE_ORDER.map((stage) => {
            const count = byStage[stage] || 0;
            const pct = Math.max(4, Math.round((count / maxCount) * 100));
            const share = totalAll > 0 ? Math.round((count / totalAll) * 100) : 0;
            return (
              <div
                key={stage}
                title={`${STAGE_LABELS[stage]} · ${count} enquiries · ${share}% of total`}
                className={cn(
                  'flex cursor-default items-center gap-3 rounded-md -m-1 p-1 transition-opacity duration-150',
                  'group-hover/funnel:opacity-40 hover:!opacity-100',
                )}
              >
                <span className="w-24 shrink-0 text-[12.5px] font-semibold text-muted">
                  {STAGE_LABELS[stage]}
                </span>
                {/* Track = remaining flex space. Bar = pct% of the track, so
                    the widest bar exactly touches the right edge and no bar
                    ever overflows the card. */}
                <div className="relative h-9 min-w-0 flex-1 overflow-hidden rounded-md bg-soft">
                  <div
                    className="relative h-full rounded-md text-right transition-[width]"
                    style={{ width: `${pct}%`, background: STAGE_COLOR[stage] }}
                  >
                    <span
                      className={cn(
                        'absolute inset-y-0 right-2.5 flex items-center text-[12.5px] font-bold text-white',
                      )}
                    >
                      {count}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
