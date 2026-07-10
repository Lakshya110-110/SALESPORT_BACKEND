'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Calendar as CalendarIcon, CalendarDays, Video, Phone as PhoneIcon, MapPin,
  Clock, Download, CheckCircle2, XCircle, Users as UsersIcon,
  Search as SearchIcon, ChevronDown, Filter,
} from 'lucide-react';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DateField } from '@/components/ui/DateField';
import { TimeField } from '@/components/ui/TimeField';
import { MiniKpi, MiniKpiStrip } from '@/components/ui/MiniKpi';
import { Switch } from '@/components/ui/Switch';
import { OutcomeModal } from '@/components/meetings/OutcomeModal';
import { endpoints } from '@/lib/api/endpoints';
import { ddmm, initials, avatarColor } from '@/lib/utils/format';
import { isValidDDMM } from '@/lib/utils/date';
import { useMasterDataValues } from '@/lib/hooks/useMasterData';
import { cn } from '@/lib/utils/cn';
import type { Meeting, Company, User as UserT } from '@/lib/api/types';

/**
 * Meetings — /meetings.
 *
 * Layout mirrors the uploaded HTML `#m-meetings`. The Schedule and
 * Reschedule flows use the mockup's drawer field set: mode segmented
 * control, date+time pair, duration / reminder selects, consultant,
 * attendees, agenda, email/whatsapp toggles with editable message bodies,
 * etc. Data still flows through the existing `/api/meetings/` endpoints.
 */

const CONSULTANT_DEFAULT_MESSAGE = (name: string) =>
  `Dear Sir/Madam,

This confirms our meeting on [date] at [time] ([mode]) regarding [purpose].

A calendar invite is attached for your convenience. Please let us know if you would like to reschedule or adjust the agenda — we are happy to accommodate.

Warm regards,
${name}
Sort String Solutions LLP`;

const CONSULTANT_DEFAULT_WA = (name: string) =>
  `Dear Sir/Madam, this confirms our meeting on [date] at [time] ([mode]). Please let us know if any changes are required. We look forward to connecting. — ${name}, Sort String Solutions`;

const RESCHEDULE_REASONS = [
  'Customer requested',
  'Consultant unavailable',
  'Clashes with another meeting',
  'Awaiting documents',
  'Other',
];

const MODE_FALLBACK = ['In-person', 'Online', 'Phone'];

export default function MeetingsPage() {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [rescheduleFor, setRescheduleFor] = useState<Meeting | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<Meeting | null>(null);

  const modeOptions = useMasterDataValues('mode', MODE_FALLBACK);

  const q = useQuery({
    queryKey: ['meetings', 'list', { when, search, status, mode }],
    queryFn: () => endpoints.meetings.list({
      when,
      search: search || undefined,
      status: status || undefined,
      mode: mode || undefined,
      page_size: 100,
    }),
  });
  // Full set for KPI stats (regardless of the tab).
  const allQ = useQuery({
    queryKey: ['meetings', 'list', 'all'],
    queryFn: () => endpoints.meetings.list({ page_size: 500 }),
  });

  const rows = q.data?.results ?? [];
  const all = allQ.data?.results ?? [];

  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = todayStart.getTime() + 7 * 24 * 60 * 60 * 1000;
  const doneOrScheduled = all.filter((m) => m.status !== 'Cancelled');
  const kpi = {
    upcoming: all.filter((m) => new Date(m.scheduled_at).getTime() >= now && m.status === 'Scheduled').length,
    today: all.filter((m) => {
      const t = new Date(m.scheduled_at).getTime();
      return t >= todayStart.getTime() && t <= todayEnd.getTime();
    }).length,
    thisWeek: all.filter((m) => {
      const t = new Date(m.scheduled_at).getTime();
      return t >= todayStart.getTime() && t < weekEnd && m.status === 'Scheduled';
    }).length,
    completed: all.filter((m) => m.status === 'Done').length,
    noShows: all.filter((m) => m.status === 'Cancelled').length,
    inPerson: doneOrScheduled.filter((m) => m.mode === 'In-person').length,
  };

  return (
    <>
      <SectionHeader
        title="Meetings"
        subtitle="All meetings scheduled across the team. Oversight view."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Download size={14} />}
              onClick={() => exportMeetingsCsv(rows)}
              disabled={rows.length === 0}
            >
              Export
            </Button>
            <Button leftIcon={<Plus size={15} />} onClick={() => setNewOpen(true)}>
              Schedule meeting
            </Button>
          </>
        }
      />

      <div className="w-full px-3 pt-3 pb-5 xl:px-4">
        <MiniKpiStrip columns={6}>
          <MiniKpi label="Upcoming" value={kpi.upcoming} tone="primary" icon={<CalendarIcon size={17} strokeWidth={1.9} />} />
          <MiniKpi label="Today" value={kpi.today} tone="warning" icon={<Clock size={17} strokeWidth={1.9} />} />
          <MiniKpi label="This week" value={kpi.thisWeek} tone="primary" icon={<CalendarDays size={17} strokeWidth={1.9} />} />
          <MiniKpi label="Completed" value={kpi.completed} tone="success" icon={<CheckCircle2 size={17} strokeWidth={1.9} />} />
          <MiniKpi label="No-shows" value={kpi.noShows} tone="danger" icon={<XCircle size={17} strokeWidth={1.9} />} />
          <MiniKpi label="In-person" value={kpi.inPerson} tone="primary" icon={<UsersIcon size={17} strokeWidth={1.9} />} />
        </MiniKpiStrip>

        <div className="rounded-lg border border-b-subtle bg-surface shadow-card">
          {/* Sticky tab bar — docks directly under the 76 px section header.
              The KPI strip above scrolls with the page (no longer sticky),
              so the tab bar doesn't need to clear a KPI band. Rounded top
              corners come from the card, so this bar also gets `rounded-t-lg`
              so it doesn't square them off. */}
          <div className="sticky top-[76px] z-10 rounded-t-lg border-b border-b-subtle bg-surface">
            <div className="flex items-center gap-1 p-2">
              <Tab active={when === 'upcoming'} onClick={() => setWhen('upcoming')}>Upcoming</Tab>
              <Tab active={when === 'past'} onClick={() => setWhen('past')}>Past</Tab>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 border-t border-b-subtle px-[14px] py-3">
              <SearchPill
                value={search}
                onChange={setSearch}
                placeholder="Search by company or purpose…"
              />
              <FilterChip
                icon={<Filter size={12} />} label="Status" value={status}
                options={['Scheduled', 'Done', 'Cancelled']}
                onPick={(v) => setStatus(v ?? '')}
              />
              <FilterChip
                icon={<Filter size={12} />} label="Mode" value={mode}
                options={modeOptions}
                onPick={(v) => setMode(v ?? '')}
              />
            </div>
          </div>

          {q.isLoading ? (
            <Skel />
          ) : q.error ? (
            <div className="p-6 text-center text-[12px] text-danger">
              Couldn&rsquo;t load meetings: {(q.error as Error).message}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-[12.5px] text-subtle">
              {search || status || mode
                ? 'No meetings match these filters.'
                : `No ${when} meetings.`}
            </div>
          ) : (
            <ul className="divide-y divide-b-subtle">
              {rows.map((m) => (
                <MeetingRow
                  key={m.id}
                  m={m}
                  onReschedule={() => setRescheduleFor(m)}
                  onViewOutcome={() => setOutcomeFor(m)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <NewMeetingModal open={newOpen} onClose={() => setNewOpen(false)} />
      {rescheduleFor && (
        <RescheduleModal
          m={rescheduleFor}
          onClose={() => setRescheduleFor(null)}
          onMarkDone={() => {
            const m = rescheduleFor;
            setRescheduleFor(null);
            setOutcomeFor(m);
          }}
        />
      )}
      {outcomeFor && (
        <OutcomeModal
          open
          meeting={outcomeFor}
          onClose={() => setOutcomeFor(null)}
        />
      )}
    </>
  );
}

// -------------------- row --------------------

function MeetingRow({
  m,
  onReschedule,
  onViewOutcome,
}: {
  m: Meeting;
  onReschedule: () => void;
  onViewOutcome: () => void;
}) {
  const dt = new Date(m.scheduled_at);
  const time = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const ModeIcon = m.mode === 'Online' ? Video : m.mode === 'Phone' ? PhoneIcon : MapPin;
  const tone: Record<string, string> = {
    Scheduled: 'bg-primary-soft text-primary',
    Done: 'bg-success-soft text-success',
    Cancelled: 'bg-danger-soft text-danger',
  };
  const clickable = m.status === 'Scheduled' || m.status === 'Done';
  const onClick = m.status === 'Scheduled' ? onReschedule
    : m.status === 'Done' ? onViewOutcome
    : undefined;
  const hint = m.status === 'Scheduled' ? 'Click to reschedule or log outcome'
    : m.status === 'Done' ? 'Click to view / edit outcome'
    : undefined;
  return (
    <li
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 px-5 py-3.5 transition-colors',
        clickable && 'cursor-pointer hover:bg-primary-soft/40',
      )}
      title={hint}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <CalendarIcon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {/* Enquiry link — stop propagation so it doesn't trigger reschedule. */}
          <Link
            href={m.enquiry ? `/enquiries/${m.enquiry}` : '#'}
            onClick={(e) => e.stopPropagation()}
            className="truncate text-[13.5px] font-semibold text-text hover:underline"
          >
            {m.company_name}
          </Link>
          <span className="truncate text-[12px] text-muted">· {m.purpose}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11.5px] text-subtle">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {ddmm(m.scheduled_at)} · {time}
          </span>
          <span className="inline-flex items-center gap-1">
            <ModeIcon size={11} /> {m.mode}
          </span>
          {m.location && <span className="truncate">{m.location}</span>}
        </div>
      </div>
      {m.consultant_name && (
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          title={m.consultant_name}
          style={{ background: avatarColor(m.consultant_name) }}
        >
          {initials(m.consultant_name)}
        </div>
      )}
      <span className={cn('shrink-0 rounded-full px-[11px] py-1 text-[11.5px] font-semibold', tone[m.status])}>
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
        {m.status}
      </span>
    </li>
  );
}

// -------------------- schedule meeting --------------------

function NewMeetingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const modes = useMasterDataValues('mode', MODE_FALLBACK);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyQuery, setCompanyQuery] = useState('');
  const [enquiryLabel, setEnquiryLabel] = useState('');
  const [purpose, setPurpose] = useState('Product demo');
  const [mode, setMode] = useState<Meeting['mode']>('In-person');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('10:00');
  const [duration, setDuration] = useState('60');
  const [reminder, setReminder] = useState('60');
  const [consultantId, setConsultantId] = useState<number | null>(null);
  const [consultantName, setConsultantName] = useState<string>('Ravi Kumar');
  const [location, setLocation] = useState('');
  const [attendees, setAttendees] = useState('');
  const [agenda, setAgenda] = useState('');
  const [emailOn, setEmailOn] = useState(true);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState(CONSULTANT_DEFAULT_MESSAGE('Ravi Kumar'));
  const [waOn, setWaOn] = useState(false);
  const [waBody, setWaBody] = useState(CONSULTANT_DEFAULT_WA('Ravi Kumar'));

  const companiesQ = useQuery({
    queryKey: ['companies', 'search-meeting', companyQuery],
    queryFn: () => endpoints.companies.list({ search: companyQuery, page_size: 6 }),
    enabled: open && companyQuery.trim().length >= 2,
  });
  const usersQ = useQuery({
    queryKey: ['users', 'list-meeting'],
    queryFn: () => endpoints.users.list({ page_size: 100 }),
    enabled: open,
  });

  // Auto-fill the templates once per field, but never clobber a hand-edited
  // one — refs (not state) so flipping them doesn't itself retrigger this
  // effect. Reset in reset() below so a fresh open re-arms the auto-fill.
  const emailSubjectEdited = useRef(false);
  const emailBodyEdited = useRef(false);
  const waBodyEdited = useRef(false);
  useEffect(() => {
    if (!emailSubjectEdited.current) {
      setEmailSubject(`Meeting confirmation — ${enquiryLabel || companyQuery || 'meeting'} · Sort String Solutions`);
    }
    if (!emailBodyEdited.current) setEmailBody(CONSULTANT_DEFAULT_MESSAGE(consultantName));
    if (!waBodyEdited.current) setWaBody(CONSULTANT_DEFAULT_WA(consultantName));
  }, [consultantName, enquiryLabel, companyQuery]);

  const submit = useMutation({
    mutationFn: () => {
      if (!companyId) throw new Error('Pick a company / enquiry.');
      const iso = combineDateTime(dateStr, timeStr);
      if (!iso) throw new Error('Enter a valid date + time.');
      // `message` stays a free-form summary of the things with no dedicated
      // field (agenda/attendees/duration/reminder). Email/WhatsApp content
      // now has its own real fields below, actually persisted server-side.
      const messageParts: string[] = [];
      if (agenda.trim()) messageParts.push('Agenda:\n' + agenda.trim());
      if (attendees.trim()) messageParts.push('Attendees: ' + attendees.trim());
      messageParts.push(`Duration: ${duration} min · Reminder: ${reminder === '0' ? 'None' : reminder + ' min'}`);
      return endpoints.meetings.create({
        company: companyId,
        purpose: purpose.trim() || 'Meeting',
        mode,
        scheduled_at: iso,
        duration_min: Number(duration) || 60,
        location: location.trim(),
        consultant: consultantId,
        notify_email: emailOn,
        notify_whatsapp: waOn,
        message: messageParts.join('\n\n'),
        email_subject: emailOn ? emailSubject : '',
        email_body: emailOn ? emailBody : '',
        whatsapp_message: waOn ? waBody : '',
      } as unknown as Partial<Meeting> & { company: number; purpose: string; scheduled_at: string });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      reset();
      onClose();
    },
  });

  const reset = () => {
    setCompanyId(null); setCompanyQuery(''); setEnquiryLabel('');
    setPurpose('Product demo'); setMode('In-person');
    setDateStr(''); setTimeStr('10:00'); setDuration('60'); setReminder('60');
    setConsultantId(null); setConsultantName('Ravi Kumar');
    setLocation(''); setAttendees(''); setAgenda('');
    setEmailOn(true); setWaOn(false);
    emailSubjectEdited.current = false;
    emailBodyEdited.current = false;
    waBodyEdited.current = false;
  };

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Schedule meeting"
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            type="submit"
            form="meeting-form"
            loading={submit.isPending}
            disabled={!companyId || !dateStr || !timeStr}
          >
            Schedule &amp; send invite
          </Button>
        </>
      }
    >
      <form
        id="meeting-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <Field label="Company / Enquiry" required>
          <div className="relative">
            <input
              className={inputCls}
              placeholder="Type to search…"
              value={companyQuery}
              onChange={(e) => { setCompanyQuery(e.target.value); setCompanyId(null); }}
            />
            {companyQuery.length >= 2 && (companiesQ.data?.results ?? []).length > 0 && !companyId && (
              <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-lg border border-b-subtle bg-surface shadow-pop">
                {(companiesQ.data?.results ?? []).map((c: Company) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => { setCompanyId(c.id); setCompanyQuery(c.name); setEnquiryLabel(c.name); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] hover:bg-soft"
                    >
                      <span className="truncate text-text">{c.name}</span>
                      <span className="text-[11px] text-subtle">{c.industry}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        <Field label="Purpose" required>
          <input
            className={inputCls}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Product demo / Requirement gathering"
          />
        </Field>

        <Field label="Mode">
          <div className="inline-flex overflow-hidden rounded-full border border-b-default bg-surface">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m as Meeting['mode'])}
                className={cn(
                  'px-4 py-1.5 text-[12.5px] font-semibold transition-colors duration-fast',
                  mode === m ? 'bg-primary text-white' : 'text-muted hover:bg-soft',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>

        {(mode === 'In-person') && (
          <Field label="Location">
            <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office / site address" />
          </Field>
        )}
        {(mode === 'Online') && (
          <Field label="Meeting link">
            <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Google Meet / Zoom URL" />
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Date" required>
            <DateField value={dateStr} onChange={setDateStr} />
          </Field>
          <Field label="Time" required>
            <TimeField value={timeStr} onChange={setTimeStr} />
          </Field>
          <Field label="Duration">
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className={inputCls}>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
          </Field>
          <Field label="Reminder">
            <select value={reminder} onChange={(e) => setReminder(e.target.value)} className={inputCls}>
              <option value="15">15 min before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
              <option value="0">No reminder</option>
            </select>
          </Field>
        </div>

        <Field label="Consultant">
          <select
            value={consultantId ?? ''}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              setConsultantId(id);
              const u = (usersQ.data?.results ?? []).find((x: UserT) => x.id === id);
              if (u) setConsultantName(u.name);
            }}
            className={inputCls}
          >
            <option value="">Unassigned</option>
            {(usersQ.data?.results ?? []).map((u: UserT) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Attendees (customer side)">
          <input className={inputCls} value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="e.g. Rajesh Kumar, Sunita Rao" />
        </Field>

        <Field label="Agenda / notes">
          <textarea rows={2} value={agenda} onChange={(e) => setAgenda(e.target.value)} className={cn(inputCls, 'h-16 py-2')} placeholder="Optional" />
        </Field>

        <SwitchRow label="Send calendar invite & email to attendees" checked={emailOn} onChange={setEmailOn} />
        {emailOn && (
          <div className="space-y-3">
            <Field label="Email subject">
              <input
                className={inputCls}
                value={emailSubject}
                onChange={(e) => { emailSubjectEdited.current = true; setEmailSubject(e.target.value); }}
              />
            </Field>
            <Field label="Email message">
              <textarea
                rows={6}
                value={emailBody}
                onChange={(e) => { emailBodyEdited.current = true; setEmailBody(e.target.value); }}
                className={cn(inputCls, 'h-40 py-2 font-mono')}
              />
            </Field>
            <NotificationStatusNote />
          </div>
        )}

        <SwitchRow label="Send WhatsApp confirmation" checked={waOn} onChange={setWaOn} />
        {waOn && (
          <Field label="WhatsApp message">
            <textarea
              rows={3}
              value={waBody}
              onChange={(e) => { waBodyEdited.current = true; setWaBody(e.target.value); }}
              className={cn(inputCls, 'h-24 py-2 font-mono')}
            />
            <NotificationStatusNote />
          </Field>
        )}

        {submit.error && (
          <div className="rounded-md bg-danger-soft p-2 text-[12px] text-danger">
            {(submit.error as Error).message}
          </div>
        )}
      </form>
    </Modal>
  );
}

// -------------------- reschedule --------------------

function RescheduleModal({
  m,
  onClose,
  onMarkDone,
}: {
  m: Meeting;
  onClose: () => void;
  onMarkDone: () => void;
}) {
  const qc = useQueryClient();
  const modes = useMasterDataValues('mode', MODE_FALLBACK);
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [mode, setMode] = useState<Meeting['mode']>(m.mode);
  const [reason, setReason] = useState('Customer requested');
  const [otherReason, setOtherReason] = useState('');
  const [emailOn, setEmailOn] = useState(true);
  const [waOn, setWaOn] = useState(false);
  const [subject, setSubject] = useState(`Request to reschedule — ${m.purpose}, ${m.company_name}`);
  const [emailBody, setEmailBody] = useState(
`Dear Sir/Madam,

Thank you for your time. We would like to request a change to our scheduled ${m.purpose}. The proposed new time is [new date & time].

Kindly confirm if this is convenient, or share an alternative slot that suits you. We apologise for any inconvenience caused.

Warm regards,
${m.consultant_name ?? 'Sort String Solutions'}
Sort String Solutions LLP`,
  );
  const [waBody, setWaBody] = useState(
`Dear Sir/Madam, we would like to reschedule our ${m.purpose} to [new date & time]. Kindly confirm if this is convenient, or suggest a slot that suits you. Thank you. — ${m.consultant_name ?? 'Sort String Solutions'}`,
  );

  const submit = useMutation({
    mutationFn: () => {
      const iso = combineDateTime(dateStr, timeStr);
      if (!iso) throw new Error('Enter a valid new date + time.');
      // One call, one save — mode, reason, notify flags, and the composed
      // email/WhatsApp content all land on the meeting together with the
      // new schedule, instead of being silently dropped.
      return endpoints.meetings.reschedule(m.id, iso, {
        mode,
        reschedule_reason: reason === 'Other' ? otherReason.trim() : reason,
        notify_email: emailOn,
        notify_whatsapp: waOn,
        email_subject: emailOn ? subject : '',
        email_body: emailOn ? emailBody : '',
        whatsapp_message: waOn ? waBody : '',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meetings'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Reschedule meeting"
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="secondary" onClick={onMarkDone}>
            Mark done
          </Button>
          <Button type="button" onClick={() => submit.mutate()} loading={submit.isPending} disabled={!dateStr || !timeStr}>
            Reschedule &amp; send
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md bg-soft p-3 text-[12.5px] text-muted">
          <b className="text-text">{m.company_name}</b> · {m.purpose} · currently{' '}
          <b className="text-text">{ddmm(m.scheduled_at)} {new Date(m.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
          {m.consultant_name ? ` with ${m.consultant_name}` : ''}.
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="New date" required>
            <DateField value={dateStr} onChange={setDateStr} />
          </Field>
          <Field label="New time" required>
            <TimeField value={timeStr} onChange={setTimeStr} />
          </Field>
        </div>

        <Field label="Mode of meeting">
          <div className="inline-flex overflow-hidden rounded-full border border-b-default bg-surface">
            {modes.map((mv) => (
              <button
                key={mv}
                type="button"
                onClick={() => setMode(mv as Meeting['mode'])}
                className={cn(
                  'px-4 py-1.5 text-[12.5px] font-semibold transition-colors duration-fast',
                  mode === mv ? 'bg-primary text-white' : 'text-muted hover:bg-soft',
                )}
              >
                {mv}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Reason for rescheduling">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
            {RESCHEDULE_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        {reason === 'Other' && (
          <Field label="Custom reason">
            <textarea rows={2} value={otherReason} onChange={(e) => setOtherReason(e.target.value)} className={cn(inputCls, 'h-16 py-2')} placeholder="Write the specific reason for rescheduling…" />
          </Field>
        )}

        <SwitchRow label="Notify attendees via email" checked={emailOn} onChange={setEmailOn} />
        <SwitchRow label="Notify attendees via WhatsApp" checked={waOn} onChange={setWaOn} />

        {emailOn && (
          <div className="space-y-3">
            <Field label="Email subject">
              <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Email message">
              <textarea rows={6} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className={cn(inputCls, 'h-40 py-2 font-mono')} />
            </Field>
            <NotificationStatusNote />
          </div>
        )}
        {waOn && (
          <Field label="WhatsApp message">
            <textarea rows={3} value={waBody} onChange={(e) => setWaBody(e.target.value)} className={cn(inputCls, 'h-24 py-2 font-mono')} />
            <NotificationStatusNote />
          </Field>
        )}

        {submit.error && (
          <div className="rounded-md bg-danger-soft p-2 text-[12px] text-danger">
            {(submit.error as Error).message}
          </div>
        )}
      </div>
    </Modal>
  );
}

// -------------------- primitives --------------------

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-[12.5px] font-semibold',
        active ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-soft',
      )}
    >
      {children}
    </button>
  );
}

function SearchPill({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  // Debounce: 220ms after typing stops, push up so the list refetches.
  // Enter still commits immediately (form submit).
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => onChange(v.trim()), 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onChange(v.trim()); }}
      role="search"
      className="flex h-10 min-w-[220px] flex-1 items-center gap-2.5 rounded-full bg-soft px-[15px]"
    >
      <SearchIcon size={15} strokeWidth={1.8} className="text-subtle" aria-hidden />
      <input
        type="search"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        aria-label="Search meetings"
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
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  options: string[];
  onPick: (v: string | null) => void;
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-[8px] text-[12.5px] font-semibold',
          'transition-colors duration-fast',
          open || value
            ? 'border-primary bg-primary-soft text-primary'
            : 'border-b-default bg-surface text-muted hover:bg-soft',
        )}
      >
        {icon}
        {label}
        {value && <span>· {value}</span>}
        <ChevronDown size={13} className={cn('opacity-60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[180px] rounded-lg border border-b-subtle bg-surface p-1.5 shadow-pop animate-slide-up"
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
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Skel() {
  return (
    <ul className="divide-y divide-b-subtle">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="p-4">
          <div className="h-6 animate-pulse rounded bg-soft" />
        </li>
      ))}
    </ul>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-semibold text-muted">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md bg-soft px-3 py-2 text-[12.5px] font-semibold text-text">
      <span>{label}</span>
      <Switch checked={checked} onChange={onChange} ariaLabel={label} />
    </label>
  );
}

/** Honest status under a composed message — messaging isn't live yet, so
 *  this says exactly that instead of implying the toggle above already
 *  sends something. */
function NotificationStatusNote() {
  return (
    <p className="text-[11px] text-subtle">
      Notification queued — will send once messaging is enabled.
    </p>
  );
}

const inputCls = cn(
  'w-full rounded-md border border-b-default bg-surface px-3 py-[10px] text-[13px] text-text placeholder:text-subtle',
  'focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-soft',
);

function maskDate(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length < 3) return d;
  if (d.length < 5) return d.slice(0, 2) + '/' + d.slice(2);
  return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
}

function combineDateTime(dateStr: string, timeStr: string): string | null {
  // isValidDDMM does real calendar-day-count validation (rejects 31/02 etc.)
  // — the previous regex-only shape check let `new Date` silently roll an
  // out-of-range day into the next month instead of failing.
  if (!isValidDDMM(dateStr) || !timeStr) return null;
  const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)!;
  const [, dd, mm, yyyy] = m;
  const [hh, mi] = timeStr.split(':');
  const local = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi));
  if (isNaN(local.getTime())) return null;
  return local.toISOString();
}

function exportMeetingsCsv(rows: Meeting[]) {
  if (!rows.length) return;
  const cols: Array<[string, (m: Meeting) => string]> = [
    ['Company',        (m) => m.company_name ?? ''],
    ['Purpose',        (m) => m.purpose ?? ''],
    ['Scheduled at',   (m) => m.scheduled_at],
    ['Mode',           (m) => m.mode ?? ''],
    ['Location',       (m) => m.location ?? ''],
    ['Status',         (m) => m.status ?? ''],
    ['Consultant',     (m) => m.consultant_name ?? ''],
    ['Duration (min)', (m) => (m.duration_min != null ? String(m.duration_min) : '')],
  ];
  const csvCell = (v: string) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = cols.map((c) => csvCell(c[0])).join(',');
  const body = rows.map((m) => cols.map((c) => csvCell(c[1](m))).join(',')).join('\n');
  const csv = '﻿' + header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `meetings-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
