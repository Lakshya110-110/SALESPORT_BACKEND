'use client';

import {
  TrendingUp,
  Users,
  Wallet,
  CheckCircle2,
  Percent,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { fmtInrShort } from '@/lib/utils/format';
import type { Dashboard } from '@/lib/api/types';

/**
 * KPI strip — six cards mirroring the mockup's `.kpis.six` row.
 * Live values come from `GET /api/dashboard/`; the delta lines are best-effort
 * text based on what the backend exposes today.
 */
type KpiCard = {
  label: string;
  value: string;
  sub: string;
  subTone?: 'up' | 'down' | 'neutral';
  icon: LucideIcon;
  iconTone?: 'primary' | 'success' | 'danger';
};

export function KpiStrip({ data }: { data: Dashboard }) {
  const total = data.total_enquiries || 0;
  const won = data.won_count || 0;
  const wonValue = Number(data.won_value || 0);
  const pipelineValue = Number(data.pipeline_value || 0);
  const conversion = total > 0 ? Math.round((won / total) * 100) : 0;
  // Weighted forecast: pipeline × 60% (a defensible v1 heuristic until the
  // backend serves a per-stage probability table)
  const forecast = pipelineValue * 0.6;
  // Overdue = admin-only unassigned proxy until the backend tracks
  // overdue follow-ups explicitly
  const overdue = data.unassigned ?? 0;

  const inProgressCount = data.by_stage?.find((r) => r.status === 'In Progress')?.count ?? 0;

  const cards: KpiCard[] = [
    {
      label: 'Forecast (weighted)',
      value: fmtInrShort(forecast),
      // 60% of a figure that is itself banded — say so, rather than let a
      // twice-estimated number read as a projection anyone can bank on.
      sub: '60% of est. pipeline',
      subTone: 'neutral',
      icon: TrendingUp,
    },
    {
      label: 'Open Enquiries',
      value: String(data.open_enquiries || 0),
      sub: `${inProgressCount} in progress`,
      subTone: 'neutral',
      icon: Users,
    },
    {
      // "(est.)" is load-bearing: deal value is picked as a band and stored as
      // that band's midpoint, so this is a sum of midpoints, not of quoted
      // figures. Wider bands above ₹15 L make the top end rougher still.
      label: 'Pipeline Value (est.)',
      value: fmtInrShort(pipelineValue),
      sub: `${data.upcoming_meetings ?? 0} meetings coming`,
      subTone: 'neutral',
      icon: Wallet,
    },
    {
      // Same reason — a won deal's value is still the band midpoint picked at
      // entry, not the price it actually closed at.
      label: 'Won This Period (est.)',
      value: fmtInrShort(wonValue),
      sub: `${won} deals`,
      subTone: 'up',
      icon: CheckCircle2,
      iconTone: 'success',
    },
    {
      label: 'Conversion',
      value: conversion + '%',
      sub: `${won} won of ${total}`,
      subTone: conversion >= 30 ? 'up' : 'neutral',
      icon: Percent,
    },
    {
      label: 'Unassigned',
      value: String(overdue),
      sub: overdue > 0 ? 'needs action' : 'all covered',
      subTone: overdue > 0 ? 'down' : 'up',
      icon: Clock,
      iconTone: overdue > 0 ? 'danger' : 'success',
    },
  ];

  return (
    // KPI strip scrolls with the page — the section header stays docked at
    // the top, but the KPIs move out of the way so the charts + side panels
    // below have the full main-scroll height to work with. Matches the
    // list-page KPI strips (Enquiries, Proposals, Meetings) which switched
    // to this behaviour too.
    <div className="mb-[14px]">
      <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 xl:grid-cols-6">
        {cards.map((c, i) => (
          <Kpi key={c.label} card={c} delay={50 + i * 40} />
        ))}
      </div>
    </div>
  );
}

function Kpi({ card, delay }: { card: KpiCard; delay: number }) {
  const Icon = card.icon;
  return (
    <div
      className={cn(
        // Flex column so the label+icon row and the value+sub block are
        // baseline-aligned across every card regardless of label wrap.
        'flex h-full flex-col rounded-card border border-b-subtle bg-surface p-[18px] shadow-card',
        'animate-slide-up opacity-0 [animation-fill-mode:forwards]',
        // Power-BI-style hover: subtle lift + accented border on hover so
        // the KPI reads as tappable/interactive without extra chrome.
        'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-pop',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top row: label + icon. Fixed 34px height so the value below always
          starts at the same y across all cards, even when a label wraps. */}
      <div className="flex h-[34px] items-start justify-between gap-2">
        <div className="line-clamp-2 text-[11px] font-semibold uppercase leading-[1.35] tracking-wider text-subtle">
          {card.label}
        </div>
        <div
          className={cn(
            'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]',
            card.iconTone === 'success' && 'bg-success-soft text-success',
            card.iconTone === 'danger' && 'bg-danger-soft text-danger',
            (!card.iconTone || card.iconTone === 'primary') && 'bg-primary-soft text-primary',
          )}
        >
          <Icon size={16} strokeWidth={2} />
        </div>
      </div>

      {/* Value + subtitle — pushed to the bottom via mt-auto so all cards
          share the same baseline for the primary number. */}
      <div className="mt-auto pt-3">
        <div className="font-display text-[26px] font-extrabold leading-none tracking-[-0.7px] text-text">
          {card.value}
        </div>
        <div
          className={cn(
            'mt-1 text-[11.5px] font-semibold',
            card.subTone === 'up' && 'text-success',
            card.subTone === 'down' && 'text-danger',
            (!card.subTone || card.subTone === 'neutral') && 'text-muted',
          )}
        >
          {card.sub}
        </div>
      </div>
    </div>
  );
}
