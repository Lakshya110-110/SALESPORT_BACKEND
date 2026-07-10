'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * MiniKpi — small KPI card used on Meetings / Proposals / etc. pages.
 * Matches the mockup's `.kpi` chrome: `--surface` bg, `--r-lg` radius,
 * `--sh-card` shadow, label 13/600 muted, value 26/800 display.
 */
export function MiniKpi({
  label,
  value,
  tone,
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
  className?: string;
}) {
  const iconTone: Record<string, string> = {
    primary: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  };
  const t = tone ?? 'primary';
  return (
    <div className={cn('flex h-full flex-col rounded-lg bg-surface p-[18px] shadow-card', className)}>
      {/* Top row: fixed 34px height so labels that wrap to two lines don't
          push the value baseline down. `items-center` vertically centers
          both the label text and the icon tile within the row, so their
          visual centers line up on the same y (icon center used to sit
          ~10px below the label's cap-line otherwise). */}
      <div className="flex h-[34px] items-center justify-between gap-2">
        <div className="line-clamp-2 text-[11px] font-semibold uppercase leading-[1.35] tracking-[.4px] text-subtle">
          {label}
        </div>
        {icon && (
          <div className={cn('flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]', iconTone[t])}>
            {icon}
          </div>
        )}
      </div>
      {/* Value pinned to the bottom via mt-auto so all cards share the same
          primary-number baseline, even when a card grows to accommodate a
          two-line label. */}
      <div className="mt-auto pt-3 font-display text-[26px] font-extrabold leading-none tracking-[-0.7px] text-text">
        {value}
      </div>
    </div>
  );
}

export function MiniKpiStrip({
  children,
  columns,
  sticky = false,
}: {
  children: ReactNode;
  /** desktop column count — defaults to 4, use 7 for the wider Meetings strip. */
  columns?: 4 | 5 | 6 | 7;
  /**
   * Opt-in only. KPI strips scroll away with the page by default so table
   * headers can dock directly under the section header. Pass `sticky` if a
   * page still wants the old behaviour.
   */
  sticky?: boolean;
}) {
  const desktop: Record<number, string> = {
    4: 'lg:grid-cols-4',
    5: 'lg:grid-cols-5',
    6: 'lg:grid-cols-6',
    7: 'lg:grid-cols-7',
  };
  return (
    <div
      className={cn(
        // Old behaviour, kept as an opt-in: dock the strip below the section
        // header (z-20 sits between the header at z-30 and the table thead
        // at z-10). Default path just leaves a 14 px gap under the KPI row.
        sticky && 'sticky top-[76px] z-20 -mx-3 bg-canvas/95 px-3 pb-[14px] pt-2 backdrop-blur xl:-mx-4 xl:px-4',
        !sticky && 'mb-[14px]',
      )}
    >
      <div className={cn('grid grid-cols-2 gap-[12px] sm:grid-cols-4', desktop[columns ?? 4])}>
        {children}
      </div>
    </div>
  );
}
