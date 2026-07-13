'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Rail } from './Rail';
import { ModalHost } from './ModalHost';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { session } from '@/lib/auth/session';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { cn } from '@/lib/utils/cn';
import type { EnquiryDetail, Touchpoint, NegotiationRound, Meeting, Proposal } from '@/lib/api/types';

/** Merges into an enquiry detail's cached query if (and only if) that
 * enquiry happens to be cached — e.g. someone has its detail page open
 * right now. A no-op otherwise; the broader invalidateQueries calls below
 * are what keep the list/dashboard views eventually consistent. */
function patchEnquiryDetail(
  qc: QueryClient,
  enquiryId: number,
  updater: (old: EnquiryDetail) => EnquiryDetail,
) {
  qc.setQueryData<EnquiryDetail>(['enquiries', 'detail', String(enquiryId)], (old) =>
    old ? updater(old) : old,
  );
}

/**
 * AppShell — the outer chrome for every authenticated route.
 *   [ Rail | main ]   with `main` scrollable.
 *
 * Also the client-side auth guard: if there is no access token, redirects to
 * /login before rendering. The redirect is intentionally client-side because
 * we chose localStorage for tokens at CHECKPOINT 0.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!session.isAuthed()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  // Realtime push — one connection for the whole authenticated app. The
  // backend already scopes both event types to what this user's role would
  // see via the REST API (crm/sockets.py's room design), so a plain
  // invalidate-and-refetch here is always showing something this user was
  // already allowed to see, just sooner.
  useEffect(() => {
    if (!ready) return;
    const socket = getSocket();
    if (!socket) return;
    const onNotification = () => qc.invalidateQueries({ queryKey: ['notifications'] });
    const onEnquiryUpdated = () => {
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    };
    // Both a new user and an edit to an existing one just mean "the roster
    // changed, refetch" — same handler for user:created and user:updated.
    const onUsersChanged = () => qc.invalidateQueries({ queryKey: ['users'] });

    // Fine-grained, payload-carrying pushes for things that happen INSIDE
    // one enquiry (crm/sockets.py's emit_enquiry_action). Each merges
    // straight into that enquiry's cached detail query first — instant,
    // no round-trip — then invalidates the broader list/dashboard/
    // meetings/proposals queries as an eventual-consistency safety net.
    const onTouchpointCreated = (data: { enquiry_id: number; touchpoint: Touchpoint }) => {
      patchEnquiryDetail(qc, data.enquiry_id, (old) => ({
        ...old,
        touchpoints: [...old.touchpoints, data.touchpoint],
      }));
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    };
    const onNegotiationCreated = (data: { enquiry_id: number; negotiation_round: NegotiationRound }) => {
      patchEnquiryDetail(qc, data.enquiry_id, (old) => ({
        ...old,
        negotiation_rounds: [...old.negotiation_rounds, data.negotiation_round],
      }));
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    };
    const onEnquiryStatusChanged = (data: { enquiry_id: number; enquiry: EnquiryDetail }) => {
      // The backend already sends the full, freshly-serialized detail
      // object for this one — swap it in wholesale rather than field-merge.
      qc.setQueryData(['enquiries', 'detail', String(data.enquiry_id)], data.enquiry);
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    };
    const onMeetingCreated = (data: { enquiry_id: number; meeting: Meeting }) => {
      patchEnquiryDetail(qc, data.enquiry_id, (old) => ({
        ...old,
        meetings: [...old.meetings, data.meeting],
      }));
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    };
    const onMeetingUpdated = (data: { enquiry_id: number; meeting: Meeting }) => {
      patchEnquiryDetail(qc, data.enquiry_id, (old) => {
        const idx = old.meetings.findIndex((m) => m.id === data.meeting.id);
        const meetings =
          idx === -1 ? [...old.meetings, data.meeting] : old.meetings.map((m) => (m.id === data.meeting.id ? data.meeting : m));
        return { ...old, meetings };
      });
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    };
    const onProposalCreated = (data: { enquiry_id: number; proposal: Proposal }) => {
      patchEnquiryDetail(qc, data.enquiry_id, (old) => ({
        ...old,
        proposals: [...old.proposals, data.proposal],
      }));
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    };

    socket.on('notification', onNotification);
    socket.on('enquiry_updated', onEnquiryUpdated);
    socket.on('user:created', onUsersChanged);
    socket.on('user:updated', onUsersChanged);
    socket.on('user:deleted', onUsersChanged);
    socket.on('touchpoint:created', onTouchpointCreated);
    socket.on('enquiry:round_logged', onNegotiationCreated);
    socket.on('enquiry:status_changed', onEnquiryStatusChanged);
    socket.on('meeting:created', onMeetingCreated);
    socket.on('meeting:updated', onMeetingUpdated);
    socket.on('proposal:created', onProposalCreated);
    return () => {
      socket.off('notification', onNotification);
      socket.off('enquiry_updated', onEnquiryUpdated);
      socket.off('user:created', onUsersChanged);
      socket.off('user:updated', onUsersChanged);
      socket.off('user:deleted', onUsersChanged);
      socket.off('touchpoint:created', onTouchpointCreated);
      socket.off('enquiry:round_logged', onNegotiationCreated);
      socket.off('enquiry:status_changed', onEnquiryStatusChanged);
      socket.off('meeting:created', onMeetingCreated);
      socket.off('meeting:updated', onMeetingUpdated);
      socket.off('proposal:created', onProposalCreated);
    };
  }, [ready, qc]);

  if (!ready) return null;

  return (
    <ModalHost>
      {/* Matches the mockup's `.app` layout: flex with 14px padding and 14px
          gap. The rail is a sticky flex-item; `min-w-0` on main keeps it
          honest so intrinsic content can't push the rail wider. */}
      <div
        id="app-root"
        className="grid min-h-dvh bg-canvas p-[14px] text-text"
        style={{
          gridTemplateColumns: 'var(--rail-w, 80px) 14px minmax(0, 1fr)',
          transition: 'grid-template-columns .22s cubic-bezier(.4,0,.2,1)',
        }}
      >
        <Rail />
        <div aria-hidden />
        <main
          id="app-main"
          className={cn(
            'sp-scroll min-w-0 overflow-y-auto rounded-[var(--r-xl)]',
          )}
          style={{ height: 'calc(100dvh - 28px)' }}
        >
          {/* Route-fade wrapper — the pathname key remounts this subtree on
              every client-side navigation, which re-fires `.section-in`. The
              subscription comes from `usePathname()` so the key actually
              updates on nav (window.location.pathname would be stale). */}
          <div className="section-in min-h-full" key={pathname}>
            {children}
          </div>
        </main>
      </div>
      <KeyboardShortcuts />
    </ModalHost>
  );
}
