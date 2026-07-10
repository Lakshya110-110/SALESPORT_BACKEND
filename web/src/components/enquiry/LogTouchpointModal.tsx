'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import { inrInput } from '@/lib/utils/format';
import { todayLocalISO } from '@/lib/utils/date';
import type { Touchpoint } from '@/lib/api/types';

/**
 * Log touchpoint — composer that mirrors the uploaded HTML `#logTpModal`:
 * five channel pills (Call / WhatsApp / SMS / Email / Note), each with its
 * own textarea placeholder, per-channel extras (call: direction + duration,
 * email: subject, note: private toggle, wa/sms: hint), and three chip
 * sections (Outcome or Category, Next step, Sentiment). Sending posts to
 * the existing `/enquiries/{id}/log_touchpoint/` endpoint with `channel`,
 * `outcome` (first chip picked in the Outcome/Category row), `note`
 * (composer text + subject line for email), and `next_action` (Next step
 * chip).
 */

type ChannelKey = 'call' | 'wa' | 'sms' | 'email' | 'note' | 'neg';

const CHANNELS: Array<{ v: ChannelKey; label: string }> = [
  { v: 'call', label: 'Call' },
  { v: 'wa', label: 'WhatsApp' },
  { v: 'sms', label: 'SMS' },
  { v: 'email', label: 'Email' },
  { v: 'note', label: 'Note' },
  { v: 'neg', label: 'Negotiation' },
];

const CHANNEL_TO_API: Record<ChannelKey, Touchpoint['channel']> = {
  call: 'Call',
  wa: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  note: 'Note',
  neg: 'Negotiation',
};

const PLACEHOLDER: Record<ChannelKey, string> = {
  call: 'What happened on this call? (outcome, remarks, next action…)',
  wa: 'WhatsApp message / outcome…',
  sms: 'SMS text / outcome…',
  email: 'Email body / summary…',
  note: 'Internal note about this enquiry…',
  neg: 'Terms / outcome of this round (e.g. 5% off + on-prem add-on quoted separately)…',
};

const BTN_LABEL: Record<ChannelKey, string> = {
  call: 'Log call',
  wa: 'Log WhatsApp',
  sms: 'Log SMS',
  email: 'Log email',
  note: 'Add note',
  neg: 'Log round',
};

// Per-channel chip sections. First key is Outcome/Category (multi-select),
// then "Next step" (single-select), then Sentiment (single-select, tinted).
type ChipSections = {
  outcomeLabel: string;
  outcome: string[];
  nextStep: string[];
  sentiment: string[];
};

const OPTS: Record<ChannelKey, ChipSections> = {
  call: {
    outcomeLabel: 'Outcome',
    outcome: ['Connected', 'No answer', 'Busy', 'Switched off', 'Wrong number', 'Interested', 'Not interested', 'Call back later'],
    nextStep: ['Follow-up call', 'Send proposal', 'Schedule meeting', 'Send WhatsApp', 'Awaiting reply', 'Negotiate', 'Close — won', 'Close — lost'],
    sentiment: ['Hot', 'Warm', 'Cold'],
  },
  wa: {
    outcomeLabel: 'Outcome',
    outcome: ['Delivered', 'Read', 'Replied', 'No reply', 'Brochure sent', 'Catalogue sent', 'Quote sent', 'Demo link sent', 'Opted out'],
    nextStep: ['Await reply', 'Call to follow up', 'Send proposal', 'Schedule meeting', 'Send reminder', 'Close — won', 'Close — lost'],
    sentiment: ['Hot', 'Warm', 'Cold'],
  },
  sms: {
    outcomeLabel: 'Outcome',
    outcome: ['Delivered', 'Failed', 'Replied', 'No reply', 'OTP sent', 'Reminder sent', 'Link sent'],
    nextStep: ['Call to follow up', 'Send WhatsApp', 'Await reply', 'Resend', 'Close'],
    sentiment: ['Hot', 'Warm', 'Cold'],
  },
  email: {
    outcomeLabel: 'Outcome',
    outcome: ['Sent', 'Opened', 'Replied', 'Bounced', 'No reply', 'Proposal sent', 'Quote sent', 'Brochure attached'],
    nextStep: ['Await reply', 'Call to follow up', 'Send WhatsApp', 'Schedule meeting', 'Resend', 'Close — won', 'Close — lost'],
    sentiment: ['Hot', 'Warm', 'Cold'],
  },
  note: {
    outcomeLabel: 'Category',
    outcome: ['Requirement', 'Competitor', 'Objection', 'Decision-maker', 'Budget', 'Timeline', 'Internal'],
    nextStep: ['Follow-up call', 'Schedule meeting', 'Send proposal', 'Awaiting reply'],
    sentiment: ['Hot', 'Warm', 'Cold'],
  },
  neg: {
    outcomeLabel: 'Round status',
    outcome: ['Open', 'Accepted', 'Rejected', 'Countered'],
    nextStep: ['Follow-up call', 'Send revised quote', 'Schedule meeting', 'Await approval', 'Close — won', 'Close — lost'],
    sentiment: ['Hot', 'Warm', 'Cold'],
  },
};

const DEFAULTS: Record<ChannelKey, { outcome: string; nextStep: string; sentiment: string }> = {
  call: { outcome: 'Connected', nextStep: 'Follow-up call', sentiment: 'Warm' },
  wa: { outcome: 'Delivered', nextStep: 'Await reply', sentiment: 'Warm' },
  sms: { outcome: 'Delivered', nextStep: 'Call to follow up', sentiment: 'Warm' },
  email: { outcome: 'Sent', nextStep: 'Await reply', sentiment: 'Warm' },
  note: { outcome: 'Requirement', nextStep: 'Follow-up call', sentiment: 'Warm' },
  neg: { outcome: 'Open', nextStep: 'Await approval', sentiment: 'Warm' },
};

export function LogTouchpointModal({
  open,
  onClose,
  enquiryId,
}: {
  open: boolean;
  onClose: () => void;
  enquiryId: number | string;
}) {
  const [channel, setChannel] = useState<ChannelKey>('call');
  const [text, setText] = useState('');
  // Call-only extras
  const [direction, setDirection] = useState<'Outbound' | 'Inbound'>('Outbound');
  const [durationSec, setDurationSec] = useState('');
  // Email-only extra
  const [subject, setSubject] = useState('');
  // Note-only extra
  const [isPrivate, setIsPrivate] = useState(false);
  // Negotiation-only extras — mirror the old Log-round form: which side
  // moved, the amount on the table, and the discount it implies.
  const [side, setSide] = useState<'Our offer' | 'Customer ask'>('Our offer');
  const [amount, setAmount] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  // Chip picks per channel
  const [outcomes, setOutcomes] = useState<Set<string>>(new Set([DEFAULTS.call.outcome]));
  const [nextStep, setNextStep] = useState<string>(DEFAULTS.call.nextStep);
  const [sentiment, setSentiment] = useState<string>(DEFAULTS.call.sentiment);
  const qc = useQueryClient();

  // Reset chip picks when the channel changes.
  useEffect(() => {
    const d = DEFAULTS[channel];
    setOutcomes(new Set([d.outcome]));
    setNextStep(d.nextStep);
    setSentiment(d.sentiment);
  }, [channel]);

  const reset = () => {
    setChannel('call');
    setText(''); setDirection('Outbound'); setDurationSec('');
    setSubject(''); setIsPrivate(false);
    setSide('Our offer'); setAmount(''); setDiscountPct('');
    const d = DEFAULTS.call;
    setOutcomes(new Set([d.outcome]));
    setNextStep(d.nextStep);
    setSentiment(d.sentiment);
  };

  const submit = useMutation({
    mutationFn: async () => {
      // WhatsApp is multi-select (several outcomes can co-occur); every
      // other channel is single-select, so `outcomes` holds at most one.
      const outcomeChip =
        channel === 'wa' ? Array.from(outcomes).join(', ') : Array.from(outcomes)[0] ?? '';
      if (channel === 'neg') {
        const amt = Number(amount.replace(/,/g, '')) || 0;
        // Structured round first — same payload the old Log-round modal
        // sent — so gap/budget maths elsewhere keep working.
        await endpoints.enquiries.logRound(enquiryId, {
          side,
          our_quote: side === 'Our offer' ? amt : 0,
          client_offer: side === 'Customer ask' ? amt : 0,
          discount_pct: discountPct ? Number(discountPct) : 0,
          round_date: todayLocalISO(),
          status: (outcomeChip || 'Open') as 'Open' | 'Accepted' | 'Rejected' | 'Countered',
          note: text.trim(),
        });
      }
      return endpoints.enquiries.logTouchpoint(enquiryId, {
        channel: CHANNEL_TO_API[channel],
        outcome: outcomeChip,
        note: text.trim(),
        next_action: nextStep,
        sentiment: (sentiment as 'Hot' | 'Warm' | 'Cold' | '') || '',
        ...(channel === 'call' && {
          direction,
          duration_sec: durationSec ? Number(durationSec) : null,
        }),
        ...(channel === 'email' && { subject: subject.trim() }),
        ...(channel === 'note' && { is_private: isPrivate }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries', 'detail', String(enquiryId)] });
      reset();
      onClose();
    },
  });

  const cfg = OPTS[channel];
  const canSubmit =
    channel === 'neg'
      ? amount.trim().length > 0
      : text.trim().length > 0 ||
        (channel === 'email' && subject.trim().length > 0);

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Log touchpoint"
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            type="submit"
            form="log-tp-form"
            loading={submit.isPending}
            disabled={!canSubmit}
          >
            {BTN_LABEL[channel]}
          </Button>
        </>
      }
    >
      <form
        id="log-tp-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (canSubmit) submit.mutate(); }}
        className="space-y-4"
      >
        {/* Channel pills — .comp-types */}
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((c) => (
            <button
              key={c.v}
              type="button"
              onClick={() => setChannel(c.v)}
              className={cn(
                'rounded-full border px-[13px] py-[7px] text-[12px] font-semibold',
                'transition-colors duration-fast',
                channel === c.v
                  ? 'border-primary-soft bg-primary-soft text-primary'
                  : 'border-b-default bg-surface text-muted hover:text-text',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Email subject (only for Email) */}
        {channel === 'email' && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className={inputCls}
          />
        )}

        {/* Text area — .comp-in */}
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER[channel]}
          className={cn(
            'w-full resize-none rounded-md border border-b-default bg-surface p-[11px] text-[13px] text-text placeholder:text-subtle',
            'focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-soft',
          )}
        />

        {/* Channel-specific extras — .comp-row */}
        <div className="flex flex-wrap items-center gap-2">
          {channel === 'call' && (
            <>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'Outbound' | 'Inbound')}
                className={cn(inputCls, 'h-9 w-[120px] py-[9px] px-[11px]')}
              >
                <option>Outbound</option>
                <option>Inbound</option>
              </select>
              <input
                value={durationSec}
                onChange={(e) => setDurationSec(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="Duration (sec)"
                className={cn(inputCls, 'h-9 w-[140px] py-[9px] px-[11px]')}
              />
            </>
          )}
          {channel === 'note' && (
            <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-muted">
              <Switch checked={isPrivate} onChange={setIsPrivate} ariaLabel="Private note" />
              Private note
            </div>
          )}
          {(channel === 'wa' || channel === 'sms') && (
            <span className="text-[11px] text-subtle">
              Logged on this enquiry&rsquo;s timeline.
            </span>
          )}
          {channel === 'neg' && (
            <>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as 'Our offer' | 'Customer ask')}
                className={cn(inputCls, 'h-9 w-[140px] py-[9px] px-[11px]')}
              >
                <option>Our offer</option>
                <option>Customer ask</option>
              </select>
              <input
                value={amount}
                onChange={(e) => setAmount(inrInput(e.target.value))}
                inputMode="decimal"
                placeholder="Amount (₹) *"
                className={cn(inputCls, 'h-9 w-[150px] py-[9px] px-[11px]')}
              />
              <input
                value={discountPct}
                onChange={(e) => setDiscountPct(oneDecimalPoint(e.target.value))}
                inputMode="decimal"
                placeholder="Discount %"
                className={cn(inputCls, 'h-9 w-[110px] py-[9px] px-[11px]')}
              />
            </>
          )}
        </div>

        {/* Chip sections — .opt-secs */}
        <div className="flex flex-col gap-3 pt-1">
          <ChipSection
            label={cfg.outcomeLabel}
            options={cfg.outcome}
            picked={outcomes}
            mode={channel === 'wa' ? 'multi' : 'single'}
            onToggle={(v) =>
              setOutcomes((s) => {
                // WhatsApp is the only channel where more than one outcome
                // can genuinely co-occur (e.g. Delivered + Read); every
                // other channel is single-select — picking a chip replaces
                // whatever was picked, and re-picking the active one clears it.
                if (channel === 'wa') {
                  const n = new Set(s);
                  if (n.has(v)) n.delete(v); else n.add(v);
                  return n;
                }
                return s.has(v) && s.size === 1 ? new Set() : new Set([v]);
              })
            }
          />
          <ChipSection
            label="Next step"
            options={cfg.nextStep}
            picked={new Set([nextStep])}
            mode="single"
            onToggle={(v) => setNextStep(v === nextStep ? '' : v)}
          />
          <ChipSection
            label="Sentiment"
            options={cfg.sentiment}
            picked={new Set([sentiment])}
            mode="single"
            sentiment
            onToggle={(v) => setSentiment(v === sentiment ? '' : v)}
          />
        </div>

        {submit.error && (
          <div className="rounded-md bg-danger-soft p-2 text-[12px] text-danger">
            {(submit.error as Error).message}
          </div>
        )}
      </form>
    </Modal>
  );
}

function ChipSection({
  label,
  options,
  picked,
  mode,
  sentiment,
  onToggle,
}: {
  label: string;
  options: string[];
  picked: Set<string>;
  mode: 'single' | 'multi';
  sentiment?: boolean;
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((v) => {
          const on = picked.has(v);
          const tone = sentiment
            ? (v === 'Hot'
                ? on ? 'bg-danger-soft text-danger border-danger-soft' : 'bg-soft text-muted border-transparent'
                : v === 'Warm'
                ? on ? 'bg-warning-soft text-warning border-warning-soft' : 'bg-soft text-muted border-transparent'
                : on ? 'bg-info-soft text-info border-info-soft' : 'bg-soft text-muted border-transparent')
            : on
              ? 'bg-primary-soft text-primary border-primary-soft'
              : 'bg-soft text-muted border-transparent hover:text-text';
          return (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(v)}
              aria-pressed={on}
              data-mode={mode}
              className={cn(
                'rounded-full border px-[10px] py-[5px] text-[11.5px] font-semibold',
                'transition-colors duration-fast',
                tone,
              )}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const inputCls = cn(
  'w-full rounded-md border border-b-default bg-surface px-3 py-[10px] text-[13px] text-text placeholder:text-subtle',
  'focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-soft',
);

// Strips to digits + at most one decimal point (e.g. "1.2.3" -> "1.23")
// so `Number(...)` can never come back NaN from this field.
function oneDecimalPoint(v: string): string {
  const raw = v.replace(/[^\d.]/g, '');
  const firstDot = raw.indexOf('.');
  if (firstDot === -1) return raw;
  return raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
}
