'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ThumbsUp, Minus, ThumbsDown } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { Switch } from '@/components/ui/Switch';
import { endpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils/cn';
import type { Meeting } from '@/lib/api/types';

type Sentiment = 'Positive' | 'Neutral' | 'Negative';

const SENTIMENT: Array<{ value: Sentiment; label: string; icon: typeof ThumbsUp; tone: string }> = [
  { value: 'Positive', label: 'Positive', icon: ThumbsUp, tone: 'success' },
  { value: 'Neutral', label: 'Neutral', icon: Minus, tone: 'muted' },
  { value: 'Negative', label: 'Negative', icon: ThumbsDown, tone: 'danger' },
];

/**
 * OutcomeModal — post-meeting outcome capture.
 *
 * Opens on "Mark done" from a Scheduled meeting, or as read/edit view when a
 * Done meeting row is clicked. Captures sentiment (Positive/Neutral/Negative),
 * a notes block, whether the decision-maker was present, and a next
 * follow-up date. On submit:
 *   1. PATCH `/meetings/{id}/` → `status: 'Done'` and merged `message`.
 *   2. POST `/enquiries/{id}/log_touchpoint/` → channel 'meeting' with the
 *      outcome + next_action so the enquiry timeline shows what happened.
 */
export function OutcomeModal({
  open,
  onClose,
  meeting,
}: {
  open: boolean;
  onClose: () => void;
  meeting: Meeting;
}) {
  const qc = useQueryClient();
  const savedSentiment = (meeting.outcome_sentiment || '') as Sentiment | '';
  const [sentiment, setSentiment] = useState<Sentiment>(
    savedSentiment || 'Neutral',
  );
  const [notes, setNotes] = useState<string>(meeting.outcome_notes || defaultNotesFor(meeting));
  const [dmPresent, setDmPresent] = useState<boolean>(meeting.decision_maker_present ?? true);
  const [nextAction, setNextAction] = useState<string>('');

  useEffect(() => {
    if (open) {
      const sv = (meeting.outcome_sentiment || '') as Sentiment | '';
      setSentiment(sv || 'Neutral');
      setNotes(meeting.outcome_notes || defaultNotesFor(meeting));
      setDmPresent(meeting.decision_maker_present ?? true);
      setNextAction('');
    }
  }, [open, meeting]);

  const submit = useMutation({
    mutationFn: async () => {
      // Write outcome to real Meeting fields (no more <<outcome:v1>> hack).
      await endpoints.meetings.patch(meeting.id, {
        status: 'Done',
        outcome_sentiment: sentiment,
        decision_maker_present: dmPresent,
        outcome_notes: notes,
      });
      if (meeting.enquiry) {
        const iso = nextAction ? ddmmyyyyToIso(nextAction) : undefined;
        // Log the outcome as its own channel now that the backend accepts
        // "Meeting" — timeline reads as a first-class channel rather than a
        // Note with a [Meeting] prefix.
        await endpoints.enquiries.logTouchpoint(meeting.enquiry, {
          channel: 'Meeting',
          outcome: sentiment,
          note: notes || `Meeting outcome — ${sentiment}`,
          next_action: iso ? `Follow up on ${nextAction}` : undefined,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  const readonly = meeting.status === 'Done' && !!savedSentiment;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={readonly ? 'Meeting outcome' : 'Log meeting outcome'}
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {readonly ? 'Close' : 'Cancel'}
          </Button>
          <Button
            type="submit"
            form="outcome-form"
            loading={submit.isPending}
            disabled={!notes.trim()}
          >
            {readonly ? 'Update outcome' : 'Save outcome'}
          </Button>
        </>
      }
    >
      <form
        id="outcome-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <div className="rounded-md bg-soft px-3 py-2 text-[12px] text-muted">
          <b className="text-text">{meeting.company_name}</b>
          {' · '}{meeting.purpose}
          {meeting.enquiry ? ' — logged to enquiry timeline.' : ' — no enquiry linked; timeline entry skipped.'}
        </div>

        <Field label="Outcome" required>
          <div className="flex gap-2">
            {SENTIMENT.map((s) => {
              const active = sentiment === s.value;
              const Icon = s.icon;
              const activeCls =
                s.tone === 'success' ? 'border-success bg-success-soft text-success'
                : s.tone === 'danger' ? 'border-danger bg-danger-soft text-danger'
                : 'border-primary bg-primary-soft text-primary';
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSentiment(s.value)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md border py-2 text-[13px] font-semibold',
                    active ? activeCls : 'border-b-default bg-surface text-muted hover:bg-soft',
                  )}
                >
                  <Icon size={15} strokeWidth={2} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Meeting notes" required>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="What was discussed? Any commitments, blockers, next steps?"
            className={cn(inputCls, 'h-auto py-2')}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Decision-maker present">
            <div className="flex h-10 items-center rounded-md border border-b-default bg-surface px-3">
              <Switch checked={dmPresent} onChange={setDmPresent} label={dmPresent ? 'Yes' : 'No'} />
            </div>
          </Field>
          <Field label="Next follow-up date">
            <DateField value={nextAction} onChange={setNextAction} minDate={new Date()} />
          </Field>
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

// A short skeleton the consultant can flesh out; scoped to the meeting's
// purpose so the placeholder feels contextual rather than generic. Only
// used when no prior outcome exists (Done meetings rehydrate real notes).
function defaultNotesFor(m: Meeting): string {
  const who = m.consultant_name ? `Attendees: ${m.consultant_name}, ` : 'Attendees: ';
  return (
    `${who}[client attendees]\n`
    + `Discussion: ${m.purpose.toLowerCase()} — key points covered.\n`
    + `Concerns / objections: \n`
    + `Commitments made: \n`
    + `Next steps: `
  );
}

function ddmmyyyyToIso(v: string): string | undefined {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const inputCls = cn(
  'h-10 w-full rounded-md border border-b-default bg-surface px-3 text-[13px] text-text placeholder:text-subtle',
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft',
);

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}
