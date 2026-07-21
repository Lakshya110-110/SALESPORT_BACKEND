'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { getSocket } from '@/lib/socket';
import { ArrowLeft, Plus } from 'lucide-react';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { Button } from '@/components/ui/Button';
import { LogTouchpointModal } from '@/components/enquiry/LogTouchpointModal';
import { UploadProposalModal } from '@/components/enquiry/UploadProposalModal';
import { UpdateStatusButton } from '@/components/enquiry/UpdateStatusButton';
import { EditEnquiryDetailsModal } from '@/components/enquiry/EditEnquiryDetailsModal';
import { EditRequirementModal } from '@/components/enquiry/EditRequirementModal';
import { SetClientBudgetModal } from '@/components/enquiry/SetClientBudgetModal';
import { SetExpectedValueModal } from '@/components/enquiry/SetExpectedValueModal';
import { endpoints } from '@/lib/api/endpoints';
import { fmtInr, ddmm, initials, avatarColor, timeAgo, fmtPhone } from '@/lib/utils/format';
import { bandLabel } from '@/lib/utils/valueBand';
import { PROPOSALS_ENABLED } from '@/lib/features';
import { cn } from '@/lib/utils/cn';
import type { EnquiryDetail, EnquiryStatus, Touchpoint } from '@/lib/api/types';

/**
 * Enquiry Detail — /enquiries/[id].
 *
 * Layout mirrors the uploaded Enterprise_CRM_Mockup_Airy.html `#m-detail`:
 *
 *   [Back]
 *   detail-top: name + status badge + priority pill + lead_id sub-line
 *               ─────────────── detail-actions: Update status · Upload Proposal
 *   stat-strip: Expected value · Client budget · Expected closure · Contact ·
 *               Source · GST number · Industry
 *   dgrid (2-col masonry):
 *     ├── card: Touchpoint Timeline (tp-add + tl items)
 *     └── stacked: Enquiry Details (info-grid) · Requirement Analysis
 *   card (full width): Negotiation History (neg-sum + table)
 */
export default function EnquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const q = useQuery({
    queryKey: ['enquiries', 'detail', id],
    queryFn: () => endpoints.enquiries.detail(id!),
    enabled: !!id,
  });

  // Joins this enquiry's Socket.IO room for the lifetime of the page so
  // AppShell's emit_enquiry_action listeners (touchpoint:created,
  // enquiry:status_changed, meeting:created/updated, proposal:created) can
  // reach us even if we're not the owner or an admin — see
  // crm/sockets.py's join_enquiry.
  useEffect(() => {
    if (!id) return;
    const socket = getSocket();
    if (!socket) return;
    const enquiryId = Number(id);
    socket.emit('join_enquiry', { enquiry_id: enquiryId });
    return () => {
      socket.emit('leave_enquiry', { enquiry_id: enquiryId });
    };
  }, [id]);

  const e = q.data;

  return (
    <>
      <SectionHeader
        title="Enquiry Detail"
        subtitle=""
        actions={undefined}
      />

      {/* Full-width main content — trimmed side padding so cards extend
          all the way to the edges of the scroll container. */}
      <div className="w-full px-3 pt-3 pb-5 xl:px-4">
        <Link
          href="/enquiries"
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-text"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Back to Enquiries
        </Link>

        {q.isLoading || !e ? (
          <DetailSkeleton />
        ) : q.error ? (
          <div className="rounded-md bg-danger-soft p-4 text-sm text-danger">
            Couldn&rsquo;t load enquiry: {(q.error as Error).message}
          </div>
        ) : (
          <DetailBody e={e} />
        )}
      </div>
    </>
  );
}

function DetailBody({ e }: { e: EnquiryDetail }) {
  const [tpOpen, setTpOpen] = useState(false);
  const [propOpen, setPropOpen] = useState(false);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [editReqOpen, setEditReqOpen] = useState(false);

  // Lead type is server-computed from the expected close date.
  const leadType = e.derived_type;
  const priorityTone: Record<string, string> = {
    Hot: 'bg-danger-soft text-danger',
    Warm: 'bg-warning-soft text-warning',
    Cold: 'bg-sunken text-muted',
  };
  const statusTone: Record<string, string> = {
    New: 'bg-info-soft text-info',
    'In Progress': 'bg-warning-soft text-warning',
    Won: 'bg-success-soft text-success',
    Lost: 'bg-danger-soft text-danger',
    Spam: 'bg-sunken text-muted',
  };

  return (
    <>
      {/* detail-top */}
      <div className="mb-4 flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* break-words: a long unbroken company name has no spaces to
                wrap on and would otherwise run past the header. */}
            <h1 className="min-w-0 break-words font-display text-[22px] font-extrabold text-text">
              {e.company_name}
            </h1>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold',
                statusTone[e.status] ?? 'bg-soft text-muted',
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {e.status}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-[7px] px-[9px] py-[3px] text-[11px] font-bold',
                priorityTone[leadType] ?? 'bg-soft text-muted',
              )}
            >
              {leadType}
            </span>
          </div>
          <div className="mt-1 text-[12px] text-subtle">
            <span className="font-mono tabular-nums text-text/70">{e.lead_id}</span>
            {e.industry && <> · {e.industry}</>}
            {e.owner_name && <> · owned by {e.owner_name}</>}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <UpdateStatusButton enquiryId={e.id} status={e.status as EnquiryStatus} />
          {/* Proposals hidden pending a rework — see lib/features. */}
          {PROPOSALS_ENABLED && (
            <Button variant="secondary" size="sm" onClick={() => setPropOpen(true)}>
              Upload Proposal
            </Button>
          )}
        </div>
      </div>

      {/* stat-strip */}
      <StatStrip e={e} />

      {/* dgrid — 2-column grid, both columns stretch to the same height so
          the section stays symmetric.
          Left  column: Touchpoint Timeline (top) → Enquiry Details (below).
          Right column: Requirement Analysis (top) → Communication (below,
          flex-1 so it grows to make the column match the left one's height).
          Enquiry Details + Requirement Analysis keep their natural sizes;
          Communication is the elastic card that absorbs any leftover space. */}
      <div className="dgrid grid grid-cols-1 items-stretch gap-[14px] lg:grid-cols-2">
        <div className="flex flex-col gap-[14px]">
          {/* Timeline gets a taller box (~ mockup `.tl { max-height:360px }`
              plus card head + tp-add + padding). `w-full` + `flex-col` on
              the wrapper so the Card inside stretches to the column width
              instead of shrinking to intrinsic content width. Enquiry
              Details stays its natural (compact) height. */}
          <div className="flex w-full flex-col" style={{ height: 460 }}>
            <TimelineCard touchpoints={e.touchpoints ?? []} onLog={() => setTpOpen(true)} />
          </div>
          <EnquiryDetailsCard e={e} onEdit={() => setEditDetailsOpen(true)} />
        </div>
        <div className="flex flex-col gap-[14px]">
          <RequirementAnalysisCard e={e} onEdit={() => setEditReqOpen(true)} />
          <div className="flex flex-1 flex-col">
            <CommunicationCard e={e} />
          </div>
        </div>
      </div>

      {/* Negotiation rounds now live inside Log Touchpoint (channel:
          Negotiation) and appear on the Touchpoint Timeline — the separate
          history table is gone. */}

      <EditEnquiryDetailsModal
        open={editDetailsOpen}
        onClose={() => setEditDetailsOpen(false)}
        enquiry={e}
      />
      <EditRequirementModal
        open={editReqOpen}
        onClose={() => setEditReqOpen(false)}
        enquiry={e}
      />
      <LogTouchpointModal open={tpOpen} onClose={() => setTpOpen(false)} enquiryId={e.id} />
      {PROPOSALS_ENABLED && (
        <UploadProposalModal
          open={propOpen}
          onClose={() => setPropOpen(false)}
          enquiryId={e.id}
          suggestedTitle={`Proposal — ${e.company_name}`}
          suggestedAmount={Number(e.expected_value) || undefined}
        />
      )}
    </>
  );
}

// -------------------- stat strip --------------------

function StatStrip({ e }: { e: EnquiryDetail }) {
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [expectedValueOpen, setExpectedValueOpen] = useState(false);
  // Client budget comes ONLY from logged negotiation rounds (budget, or
  // failing that the latest counter-offer). No guessed placeholder — when
  // nothing is logged the tile honestly shows a dash.
  const rounds = e.negotiation_rounds ?? [];
  // Sort explicitly by created_at (a reliable server timestamp, unlike the
  // optional/user-editable round_date) rather than trusting the API's
  // return order — picking .reverse() on an unverified order could silently
  // surface a stale round's figure instead of the latest one.
  const lastWithClientFigure = [...rounds]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .reverse()
    .find((r) => Number(r.client_budget) > 0 || Number(r.client_offer) > 0);
  const clientBudget = lastWithClientFigure
    ? Number(lastWithClientFigure.client_budget) || Number(lastWithClientFigure.client_offer)
    : null;

  const stats: Array<{
    label: string;
    value: ReactNode;
    money?: boolean;
    action?: ReactNode;
    hint?: string;
  }> = [
    {
      label: 'Expected deal value',
      // The band, not the number. Deal value is picked as a range and stored as
      // that band's midpoint, so rendering the stored figure would show an
      // invented number ("₹5,50,000") as if someone had quoted it.
      value: bandLabel(e.expected_value),
      action: (
        <button
          type="button"
          onClick={() => setExpectedValueOpen(true)}
          aria-label="Update expected deal value"
          className="rounded-md p-1 text-subtle hover:bg-primary-soft hover:text-primary"
        >
          <Plus size={13} strokeWidth={2.2} />
        </button>
      ),
    },
    {
      label: 'Client budget',
      value: clientBudget !== null ? fmtInr(clientBudget) : '—',
      money: true,
      action: (
        <button
          type="button"
          onClick={() => setBudgetOpen(true)}
          aria-label={clientBudget !== null ? 'Update client budget' : 'Set client budget'}
          className="rounded-md p-1 text-subtle hover:bg-primary-soft hover:text-primary"
        >
          <Plus size={13} strokeWidth={2.2} />
        </button>
      ),
    },
    { label: 'Expected closure', value: e.expected_close_date ? ddmm(e.expected_close_date) : '—' },
    {
      label: 'Contact',
      // Designation qualifies the NAME, so it only shows when there is a real
      // contact — not when this has fallen back to the owner, whose job title
      // this is not.
      value: e.contact_name
        ? `${e.contact_name}${e.contact_designation ? ` · ${e.contact_designation}` : ''}`
        : e.owner_name || '—',
    },
    { label: 'Source', value: e.source },
    { label: 'Industry', value: e.industry },
  ];
  return (
    <>
      {/* Matches mockup .stat-strip: grid-auto-flow:column · grid-auto-columns:1fr
          · gap:12px. Each .stat has padding 14px 15px, --r-lg radius, --sh-card.
          Cards use flex-column with `mt-auto` on the value so a wrapped label
          (e.g. "Expected deal value") doesn't shift the number's baseline. */}
      <div
        className={cn(
          'mb-[14px] grid gap-3 sp-scroll',
        )}
        style={{ gridAutoFlow: 'column', gridAutoColumns: 'minmax(120px, 1fr)' }}
      >
        {stats.map((s) => (
          // `min-w-0`: a grid item defaults to min-width:auto, so a long
          // unbroken value (a pasted name with no spaces) would force the
          // column wider than its 1fr share and spill out of the card.
          <div
            key={s.label}
            className="flex h-full min-w-0 flex-col rounded-lg border border-b-subtle bg-surface px-[15px] py-[14px] shadow-card"
          >
            <div className="flex items-center justify-between gap-1">
              <div className="text-[10.5px] font-semibold uppercase leading-[1.3] tracking-[.4px] text-subtle">
                {s.label}
              </div>
              {s.action}
            </div>
            {/* Truncated rather than wrapped: the strip is a single row of
                fixed-height tiles, so one long value must not make every tile
                taller. Full value stays available on hover. */}
            <div
              title={typeof s.value === 'string' ? s.value : undefined}
              className={cn(
                'mt-auto truncate pt-[3px] text-[15px] font-semibold leading-[1.3] text-text',
                s.money && 'font-mono tabular-nums',
              )}
            >
              {s.value}
            </div>
            {s.hint && s.hint !== '—' && (
              <div className="truncate pt-[2px] text-[10.5px] font-semibold leading-[1.3] text-subtle">
                {s.hint}
              </div>
            )}
          </div>
        ))}
      </div>
      <SetClientBudgetModal open={budgetOpen} onClose={() => setBudgetOpen(false)} enquiryId={e.id} />
      <SetExpectedValueModal
        open={expectedValueOpen}
        onClose={() => setExpectedValueOpen(false)}
        enquiryId={e.id}
        currentValue={e.expected_value}
      />
    </>
  );
}

// -------------------- timeline --------------------

function TimelineCard({
  touchpoints,
  onLog,
}: {
  touchpoints: Touchpoint[];
  onLog: () => void;
}) {
  const sorted = [...touchpoints].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return (
    <Card className="flex h-full flex-col">
      <CardHead title="Touchpoint Timeline" hint={<span className="text-primary">{sorted.length} total</span>} />
      <div className="flex min-h-0 flex-1 flex-col p-[18px]">
        {/* tp-add — stays fixed at the top of the card; only the timeline
            list below it scrolls. */}
        <button
          type="button"
          onClick={onLog}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-b-default bg-soft py-3 text-[12.5px] font-semibold text-muted shrink-0',
            'hover:border-primary hover:bg-primary-soft hover:text-primary',
            'transition-colors duration-fast',
          )}
        >
          <Plus size={14} strokeWidth={2} />
          Log a touchpoint
        </button>

        {sorted.length === 0 ? (
          <div className="mt-5 rounded-md border border-dashed border-b-default bg-soft p-6 text-center text-[12.5px] text-subtle">
            No touchpoints yet — the timeline populates as calls / notes are logged.
          </div>
        ) : (
          <ol
            data-testid="timeline-scroll"
            className="sp-scroll mt-[18px] min-h-0 flex-1 overflow-y-auto pr-2"
          >
            {sorted.map((t, i) => (
              <TimelineItem key={t.id} t={t} last={i === sorted.length - 1} />
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

function TimelineItem({ t, last }: { t: Touchpoint; last: boolean }) {
  const dotColor: Record<Touchpoint['channel'], string> = {
    Call: 'var(--info)',
    WhatsApp: '#16A34A',
    SMS: 'var(--purple)',
    Email: 'var(--warning)',
    Note: 'var(--accent)',
    Meeting: 'var(--primary)',
    Negotiation: 'var(--danger)',
    // Muted on purpose: it's the origin marker, not activity anyone did.
    Created: 'var(--b-strong)',
  };
  return (
    <li className="relative pb-5 pl-7 last:pb-0">
      {/* dot */}
      <span
        aria-hidden
        className="absolute left-0 top-[1px] block h-[15px] w-[15px] rounded-full bg-surface"
        style={{ border: `2.5px solid ${dotColor[t.channel] ?? 'var(--primary)'}` }}
      />
      {/* connecting line */}
      {!last && (
        <span
          aria-hidden
          className="absolute left-[6.5px] top-[16px] bottom-[-6px] w-[2px] bg-b-default"
        />
      )}
      <div className="flex flex-wrap items-center gap-2 leading-4">
        <span className="text-[12.5px] font-semibold text-text">{channelLabel(t)}</span>
        <span className="text-[11.5px] text-subtle">{ddmm(t.created_at)} · {timeAgo(t.created_at)}</span>
      </div>
      {/* break-words on every free-text field below: default overflow-wrap only
          breaks at spaces, so a single unbroken run (a pasted id, a mistyped
          keyboard mash) has nowhere to wrap and runs off the card in one long
          line instead of flowing to the next. Same fix as the description
          block further down. whitespace-pre-line keeps the author's own line
          breaks, which a plain block would otherwise collapse. */}
      {t.outcome && (
        <div className="mt-1 whitespace-pre-line break-words text-[12.5px] text-muted">
          {t.outcome}
        </div>
      )}
      {t.channel === 'Email' && t.subject && (
        <div className="mt-1 break-words text-[12.5px] font-semibold text-text">{t.subject}</div>
      )}
      {t.note && (
        <div className="mt-1 whitespace-pre-line break-words text-[12.5px] text-muted">
          {t.note}
        </div>
      )}
      {(t.next_action || t.created_by_name || t.sentiment || t.is_private) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* min-w-0 as well as break-words: this is a flex item, and a flex
              item defaults to min-width:auto, so it refuses to shrink below its
              content and break-words alone would never get the chance to act. */}
          {t.next_action && (
            <span className="min-w-0 max-w-full break-words rounded-md bg-soft px-2 py-[3px] text-[10.5px] font-semibold text-muted">
              Next: {t.next_action}
            </span>
          )}
          {t.sentiment && (
            <span className={cn('rounded-md px-2 py-[3px] text-[10.5px] font-semibold', SENTIMENT_TONE[t.sentiment])}>
              {t.sentiment}
            </span>
          )}
          {t.is_private && (
            <span className="rounded-md bg-soft px-2 py-[3px] text-[10.5px] font-semibold text-muted">
              Private
            </span>
          )}
          {t.created_by_name && (
            <span className="text-[10.5px] text-subtle">by {t.created_by_name}</span>
          )}
        </div>
      )}
    </li>
  );
}

const SENTIMENT_TONE: Record<string, string> = {
  Hot: 'bg-danger-soft text-danger',
  Warm: 'bg-warning-soft text-warning',
  Cold: 'bg-info-soft text-info',
};

function channelLabel(t: Touchpoint): string {
  if (t.channel === 'Call') {
    const dir = (t.direction || 'Outbound').toLowerCase();
    if (!t.duration_sec) return `Call · ${dir}`;
    const m = Math.floor(t.duration_sec / 60);
    const s = t.duration_sec % 60;
    return `Call · ${dir} · ${m ? `${m}m ` : ''}${s}s`;
  }
  if (t.channel === 'Note') return 'Note';
  if (t.channel === 'Created') return 'Lead created';
  return t.channel;
}

// -------------------- enquiry details --------------------

function EnquiryDetailsCard({ e, onEdit }: { e: EnquiryDetail; onEdit: () => void }) {
  return (
    <Card>
      <CardHead
        title="Enquiry Details"
        hint={
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md px-2 py-0.5 font-semibold text-primary hover:bg-primary-soft"
          >
            Edit
          </button>
        }
      />
      <div className="p-[18px]">
        <InfoGrid
          items={[
            ['Company', e.company_name],
            ['Owner', e.owner_name ?? '—'],
            ['Priority', e.derived_type],
            ['Expected closure', e.expected_close_date ? ddmm(e.expected_close_date) : '—'],
            ['Source', e.source],
            ['GSTIN', e.gstin || <span className="italic text-subtle">Add via Edit</span>],
            ['Created', ddmm(e.created_at)],
          ]}
        />
      </div>
    </Card>
  );
}

function RequirementAnalysisCard({ e, onEdit }: { e: EnquiryDetail; onEdit: () => void }) {
  const em = <span className="italic text-subtle">—</span>;
  // The band, for the same reason as the stat tile: the stored figure is a
  // midpoint, not a quoted price.
  const expectedValue = Number(e.expected_value) > 0 ? bandLabel(e.expected_value) : em;
  const expectedClose = e.expected_close_date ? ddmm(e.expected_close_date) : em;
  return (
    <Card>
      <CardHead
        title="Requirement Analysis"
        hint={
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md px-2 py-0.5 font-semibold text-primary hover:bg-primary-soft"
          >
            Edit
          </button>
        }
      />
      <div className="p-[18px]">
        {/* Same 2-col InfoGrid shape as EnquiryDetailsCard so the two cards
            read as a matched pair. Four entries so both rows are full — no
            hole in the last row. */}
        <InfoGrid
          items={[
            ['Industry', e.industry],
            ['Enquiry type', e.derived_type],
            ['Expected value', expectedValue],
            ['Expected closure', expectedClose],
          ]}
        />
        {/* Solution offered + Description sit below the grid as full-width
            labeled blocks (same label typography/gap as an InfoGrid cell)
            rather than a 5th grid cell — that would leave a hole in the last
            row of the 2-col grid above. */}
        <div className="mt-[13px]">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            Solution offered
          </div>
          <div className="mt-[3px] text-[13.5px] text-text">
            {e.solution_type
              ? e.solution_type === 'Other' && e.solution_type_other.trim()
                ? `Other — ${e.solution_type_other.trim()}`
                : e.solution_type
              : em}
          </div>
        </div>
        <div className="mt-[13px]">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            Description
          </div>
          {/* Capped + scrolled: a long description used to grow this card
              without limit, stretching the whole 2-col grid. `pr-1.5` keeps
              the text clear of the scrollbar track.
              `break-words` is load-bearing: without it an unbroken run of
              characters (no spaces to wrap on) lays out as one very wide
              line, so the block stays one line tall, the max-height never
              engages, and you get a sideways line instead of a scrollbar. */}
          <div className="sp-scroll mt-[3px] max-h-[150px] overflow-y-auto whitespace-pre-line break-words pr-1.5 text-[13.5px] leading-[1.55] text-text">
            {e.description?.trim() || em}
          </div>
        </div>
      </div>
    </Card>
  );
}

function InfoGrid({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <div className="grid grid-cols-2 gap-x-[18px] gap-y-[13px] py-1">
      {items.map(([label, value]) => (
        // min-w-0 + break-words so a long unbroken value wraps inside its
        // half of the grid instead of widening the column past 50%.
        <div key={label} className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            {label}
          </div>
          <div className="mt-[3px] break-words text-[13.5px] text-text">{value}</div>
        </div>
      ))}
    </div>
  );
}

// -------------------- negotiation --------------------

// -------------------- communication --------------------

type Channel = 'wa' | 'sms' | 'email' | 'notes';

function CommunicationCard({ e }: { e: EnquiryDetail }) {
  const [tab, setTab] = useState<Channel>('wa');
  // e.contact is only the FK id — e.contact_name is the actual string to
  // display. Falls back to the owner (internal) only when there's truly no
  // linked contact, then to the company name in the JSX below.
  const contactName = e.contact_name || e.owner_name;
  // The Notes tab is the one channel with no external connector — Note
  // touchpoints are already real rows (logged via Log Touchpoint), so this
  // pane shows them for real instead of a permanent placeholder.
  const notes = [...e.touchpoints]
    .filter((t) => t.channel === 'Note')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-b-subtle px-5 py-3">
        <h3 className="font-display text-[14px] font-semibold text-text">Communication</h3>
        <span className="text-[11.5px] text-subtle">
          {contactName ?? e.company_name}{e.phone ? ` · ${fmtPhone(e.phone)}` : ''}
        </span>
      </div>
      {/* min-h-0: without it this flex child won't shrink below its content, so
          a long thread grows the whole card instead of scrolling inside it. */}
      <div className="flex min-h-0 flex-1 flex-col p-[18px]">
        {/* rbac-note */}
        <div className="mb-[14px] flex items-start gap-[9px] rounded-md border border-transparent bg-warning-soft p-[9px_11px] text-[11px] leading-[1.5] text-muted">
          <svg width={15} height={15} viewBox="0 0 24 24" stroke="var(--warning)" strokeWidth={1.8} fill="none" className="mt-[1px] shrink-0">
            <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span>
            <b className="font-bold text-text">Mockup shows full threads.</b>{' '}
            In production, message bodies are owner-scoped — admin access is a separate permission
            (<span className="font-mono text-[10px] text-warning">enquiry.comms.read_body</span>) and every full-thread view is audit-logged.
            Only company-channel comms (WhatsApp Business API, SMS gateway, shared mailbox) are ingested.
          </span>
        </div>

        {/* ch-tabs */}
        <div className="mb-[14px] flex flex-wrap gap-[6px]">
          {[
            { k: 'wa' as const, label: 'WhatsApp', dot: '#16A34A' },
            { k: 'sms' as const, label: 'SMS' },
            { k: 'email' as const, label: 'Email' },
            { k: 'notes' as const, label: 'Notes' },
          ].map((c) => (
            <button
              key={c.k}
              type="button"
              onClick={() => setTab(c.k)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-transparent px-[11px] py-[6px] text-[12px] font-semibold',
                'transition-colors duration-fast',
                tab === c.k
                  ? 'border-primary-soft bg-primary-soft text-primary'
                  : 'bg-soft text-muted hover:text-text',
              )}
            >
              {c.dot && (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: c.dot }}
                />
              )}
              {c.label}
            </button>
          ))}
        </div>

        {/* ch-pane — grows to fill the card when Communication is stretched. */}
        {tab === 'sms' ? (
          <SmsPane e={e} />
        ) : tab === 'email' ? (
          <EmailPane e={e} />
        ) : tab === 'notes' && notes.length > 0 ? (
          <div className="sp-scroll flex-1 space-y-2.5 overflow-y-auto rounded-md border border-b-subtle bg-soft/40 p-3">
            {notes.map((n) => (
              <div key={n.id} className="rounded-md border border-b-subtle bg-surface p-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-text">{n.created_by_name ?? 'Unknown'}</span>
                  <span className="text-[10.5px] text-subtle">{ddmm(n.created_at)} · {timeAgo(n.created_at)}</span>
                  {n.is_private && (
                    <span className="rounded-md bg-soft px-2 py-[2px] text-[10px] font-semibold text-muted">
                      Private
                    </span>
                  )}
                </div>
                {/* Same unbroken-run wrap fix as the timeline note above. */}
                <div className="whitespace-pre-line break-words text-[12.5px] text-muted">{n.note}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col rounded-md border border-b-subtle bg-soft/40 p-4 text-[12.5px] text-subtle">
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
              <div className="text-[13px] font-semibold text-text">
                {tab === 'wa' && 'WhatsApp isn’t connected yet.'}
                {tab === 'notes' && 'No internal notes yet.'}
              </div>
              <div className="max-w-md text-[12px] leading-relaxed">
                {tab === 'notes'
                  ? 'Log a touchpoint with the Note channel and it will appear here.'
                  : 'Sending WhatsApp needs a WhatsApp Business provider (Meta / a BSP) — a setup step, not a switch. Ask the team to wire one.'}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * SMS pane — the outbound half of Option A. Shows SMS touchpoints for this
 * enquiry as a thread, and a composer that sends a DLT-approved template.
 *
 * Consultants pick a template; they can't type free text, because India's DLT
 * regime only permits registered template bodies. The preview fills the same
 * {blanks} the server does so what you see is what goes out.
 */
function SmsPane({ e }: { e: EnquiryDetail }) {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState<number | null>(null);

  const sms = [...e.touchpoints]
    .filter((t) => t.channel === 'SMS')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const templatesQ = useQuery({
    queryKey: ['sms-templates'],
    queryFn: () => endpoints.smsTemplates.list(),
    staleTime: 5 * 60 * 1000,
  });
  const templates = templatesQ.data?.results ?? [];
  const selected = templates.find((t) => t.id === templateId) ?? null;

  // Client-side preview of the same blanks the server fills, so the consultant
  // sees the real message before sending.
  const preview = selected
    ? selected.body
        .replace(/\{name\}/g, e.contact_name ?? '')
        .replace(/\{company\}/g, e.company_name ?? '')
        .replace(/\{lead_id\}/g, e.lead_id ?? '')
        .replace(/\{consultant\}/g, e.owner_name ?? '')
    : '';

  const send = useMutation({
    mutationFn: () => endpoints.enquiries.sendSms(e.id, templateId as number),
    onSuccess: () => {
      // The sent SMS is a new touchpoint on this enquiry.
      qc.invalidateQueries({ queryKey: ['enquiries', 'detail', String(e.id)] });
      setTemplateId(null);
    },
  });

  const noPhone = !(e.contact_name && e.phone) && !e.phone;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* thread */}
      <div className="sp-scroll min-h-[80px] flex-1 space-y-2.5 overflow-y-auto rounded-md border border-b-subtle bg-soft/40 p-3">
        {sms.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-6 text-center text-[12px] text-subtle">
            <div className="text-[13px] font-semibold text-text">No SMS sent yet.</div>
            <div>Pick a template below and send a follow-up.</div>
          </div>
        ) : (
          sms.map((t) => (
            <div key={t.id} className="ml-auto max-w-[85%] rounded-md rounded-br-sm border border-primary-soft bg-primary-soft/60 p-2.5">
              <div className="whitespace-pre-line break-words text-[12.5px] text-text">{t.note}</div>
              <div className="mt-1 text-right text-[10.5px] text-subtle">
                {t.created_by_name ?? ''} · {timeAgo(t.created_at)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* composer */}
      <div className="rounded-md border border-b-subtle bg-surface p-3">
        {templates.length === 0 ? (
          <p className="text-[11.5px] text-subtle">
            No SMS templates yet. An admin adds DLT-approved templates in settings before messages can be sent.
          </p>
        ) : (
          <>
            <select
              value={templateId ?? ''}
              onChange={(ev) => setTemplateId(ev.target.value ? Number(ev.target.value) : null)}
              className="h-9 w-full rounded-md border border-b-default bg-surface px-2.5 text-[12.5px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
            >
              <option value="">Choose a template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {selected && (
              <div className="mt-2 whitespace-pre-line break-words rounded-md bg-soft p-2 text-[12px] text-muted">
                {preview}
              </div>
            )}
            {send.error && (
              <div className="mt-2 rounded-md bg-danger-soft p-2 text-[11.5px] text-danger">
                {(send.error as Error).message}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10.5px] text-subtle">
                Sent to {e.contact_name || e.company_name}{e.phone ? ` · ${fmtPhone(e.phone)}` : ''}
              </span>
              <Button
                size="sm"
                loading={send.isPending}
                disabled={!templateId || noPhone}
                onClick={() => send.mutate()}
              >
                Send SMS
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Email pane — free-text subject + body to the lead's contact, sent via SMTP
 * (or logged in dev), and the sent emails as a thread. No template constraint,
 * unlike SMS: email isn't governed by DLT.
 */
function EmailPane({ e }: { e: EnquiryDetail }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const emails = [...e.touchpoints]
    .filter((t) => t.channel === 'Email')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const send = useMutation({
    mutationFn: () => endpoints.enquiries.sendEmail(e.id, subject.trim(), body.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries', 'detail', String(e.id)] });
      setSubject('');
      setBody('');
    },
  });

  const toEmail = e.email || '';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* thread */}
      <div className="sp-scroll min-h-[70px] flex-1 space-y-2.5 overflow-y-auto rounded-md border border-b-subtle bg-soft/40 p-3">
        {emails.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-6 text-center text-[12px] text-subtle">
            <div className="text-[13px] font-semibold text-text">No emails sent yet.</div>
            <div>Compose one below.</div>
          </div>
        ) : (
          emails.map((t) => (
            <div key={t.id} className="ml-auto max-w-[90%] rounded-md rounded-br-sm border border-b-subtle bg-surface p-2.5">
              {t.subject && <div className="mb-0.5 text-[12px] font-semibold text-text">{t.subject}</div>}
              <div className="whitespace-pre-line break-words text-[12px] text-muted">{t.note}</div>
              <div className="mt-1 text-right text-[10.5px] text-subtle">
                {t.created_by_name ?? ''} · {timeAgo(t.created_at)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* composer */}
      <div className="space-y-2 rounded-md border border-b-subtle bg-surface p-3">
        {!toEmail ? (
          <p className="text-[11.5px] text-subtle">This enquiry has no contact email to send to.</p>
        ) : (
          <>
            <input
              value={subject}
              onChange={(ev) => setSubject(ev.target.value)}
              placeholder="Subject"
              className="h-9 w-full rounded-md border border-b-default bg-surface px-2.5 text-[12.5px] text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
            />
            <textarea
              value={body}
              onChange={(ev) => setBody(ev.target.value)}
              rows={3}
              placeholder="Write your message…"
              className="w-full rounded-md border border-b-default bg-surface px-2.5 py-2 text-[12.5px] leading-relaxed text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
            />
            {send.error && (
              <div className="rounded-md bg-danger-soft p-2 text-[11.5px] text-danger">
                {(send.error as Error).message}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] text-subtle">To {toEmail}</span>
              <Button
                size="sm"
                loading={send.isPending}
                disabled={!subject.trim() || !body.trim()}
                onClick={() => send.mutate()}
              >
                Send Email
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// -------------------- primitives --------------------

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-b-subtle bg-surface shadow-card', className)}>
      {children}
    </div>
  );
}

function CardHead({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-b-subtle px-5 py-3">
      <h3 className="font-display text-[14px] font-semibold text-text">{title}</h3>
      {hint && <span className="text-[12.5px]">{hint}</span>}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        <div className="h-8 w-56 sp-skeleton" />
        <div className="h-6 w-24 sp-skeleton rounded-full" />
      </div>
      <div className="mb-[14px] grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-16 sp-skeleton rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-2">
        <div className="h-96 sp-skeleton rounded-lg" />
        <div className="space-y-[14px]">
          <div className="h-48 sp-skeleton rounded-lg" />
          <div className="h-48 sp-skeleton rounded-lg" />
        </div>
      </div>
      <div className="mt-[14px] h-72 sp-skeleton rounded-lg" />
    </>
  );
}

// Silence unused imports if we later add avatar + initials to negotiation rows.
void initials;
void avatarColor;
