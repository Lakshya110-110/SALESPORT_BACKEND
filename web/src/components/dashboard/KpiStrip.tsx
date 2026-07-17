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
import { GlassEffect } from '@/components/ui/liquid-glass';
import { LIQUID_GLASS_PREVIEW } from '@/lib/features';
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

  // Forecast = open pipeline × the team's REAL win rate, served by the backend
  // as Won / (Won + Lost) over all time. It used to be a hardcoded × 0.60 with
  // no basis in the data — a number that looked like analysis and wasn't.
  //
  // `win_rate` is null until something has actually resolved. Don't fall back
  // to a default: a made-up multiplier is exactly what this replaced, and a
  // forecast built from zero closed deals should say so, not print a figure.
  const winRate = data.win_rate;
  const forecast = winRate === null || winRate === undefined ? null : pipelineValue * winRate;
  // Overdue = admin-only unassigned proxy until the backend tracks
  // overdue follow-ups explicitly
  const overdue = data.unassigned ?? 0;

  const inProgressCount = data.by_stage?.find((r) => r.status === 'In Progress')?.count ?? 0;

  const cards: KpiCard[] = [
    {
      label: 'Forecast (est.)',
      value: forecast === null ? '—' : fmtInrShort(forecast),
      // Show the rate AND the sample it came from: "74% win rate · 17/23" is an
      // honest claim, "74%" alone hides that it rests on 23 deals. The pipeline
      // it multiplies is itself a sum of band midpoints, hence "est.".
      sub: forecast === null
        ? 'no closed deals yet'
        : `${Math.round((winRate as number) * 100)}% win rate · ${data.won_resolved}/${data.resolved_count} closed`,
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
      // Won over EVERY enquiry, open ones included — a funnel number, not a
      // win rate, and it sits next to a Forecast quoting a much higher "win
      // rate". Spelling out the still-open count stops the two reading as a
      // contradiction: they answer different questions.
      label: 'Conversion',
      value: conversion + '%',
      sub: `${won} won of ${total} · ${data.open_enquiries || 0} still open`,
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

  // TEMPORARY liquid-glass preview — LIQUID_GLASS_PREVIEW in lib/features.
  // Same content, glass shell instead of the solid card. The entrance stagger
  // moves onto the wrapper so the strip still arrives in sequence.
  if (LIQUID_GLASS_PREVIEW) {
    return (
      <GlassEffect
        className="h-full animate-slide-up opacity-0 [animation-fill-mode:forwards] hover:-translate-y-[2px]"
        style={{ animationDelay: `${delay}ms` }}
      >
        <div className="flex h-full flex-col p-[18px]">
          <div className="flex h-[34px] items-start justify-between gap-2">
            <div className="line-clamp-2 text-[11px] font-semibold uppercase leading-[1.35] tracking-wider text-black/70 dark:text-white/70">
              {card.label}
            </div>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/40 text-black/70 dark:bg-white/10 dark:text-white/80">
              <Icon size={15} strokeWidth={2} />
            </span>
          </div>
          <div className="mt-auto">
            <div className="font-display text-[22px] font-extrabold leading-none tracking-[-.01em] text-black dark:text-white">
              {card.value}
            </div>
            {card.sub && (
              <div className="mt-1.5 text-[11.5px] font-medium text-black/60 dark:text-white/60">{card.sub}</div>
            )}
          </div>
        </div>
      </GlassEffect>
    );
  }

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
