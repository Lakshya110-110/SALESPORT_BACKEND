# Realtime events (Socket.IO)

Canonical reference for every event the backend pushes over Socket.IO. This
is the contract both the web app and the Flutter mobile app subscribe to —
**event names here are final; do not rename without updating this file and
telling both client teams.**

Server implementation: `salesport_backend/crm/sockets.py` (room/emit
helpers) + `salesport_backend/crm/views.py` (call sites, one per mutating
endpoint). Web client implementation: `web/src/lib/socket.ts` (connection)
+ `web/src/components/shell/AppShell.tsx` (listeners).

## Connecting

```
io("http://<host>:<port>", {
  auth: { token: "<JWT access token>" },
  transports: ["websocket", "polling"],
})
```

- Same host/port as the REST API, **without** the `/api` prefix — Socket.IO
  serves its own path (`/socket.io/`) at the app root.
- `auth.token` is the same bearer JWT access token used for REST calls, not
  a cookie or a separate socket token. An invalid/missing/expired token
  rejects the connection (server-side `connect` handler in `sockets.py`).
- On successful connect, the server auto-joins every socket into two rooms
  based on the authenticated user: `user:{user_id}` and `role:{role}`
  (`role:admin` or `role:consultant`). No client action needed for these
  two — they're what deliver `notification` and the original
  `enquiry_updated` signal.

## Joining an enquiry's room

The five per-action events below (`touchpoint:created`,
`enquiry:status_changed`, `enquiry:round_logged`, `meeting:created`,
`meeting:updated`, `proposal:created`) additionally target a room scoped to
one specific enquiry: `enquiry:{enquiry_id}`. A client viewing an enquiry's
detail screen should join that room for as long as the screen is open:

```
socket.emit("join_enquiry", { enquiry_id: 151 })
// ... screen closes / navigates away ...
socket.emit("leave_enquiry", { enquiry_id: 151 })
```

`join_enquiry` is permission-checked server-side, mirroring the REST API's
own visibility rule (`EnquiryViewSet.get_queryset`): admins may join any
enquiry's room; consultants only an enquiry they own. A join for an
enquiry you can't see is silently ignored (no room is joined, no error is
sent back).

You don't strictly need to join the enquiry room to receive these five
events — they're *also* sent to `role:admin` and to `user:{owner_id}` (the
enquiry's current owner), so admins and the owning consultant get them
regardless. Joining the room is what lets a client see the events for an
enquiry it's actively looking at even in scenarios where enquiry sharing
broadens beyond owner-only in the future.

## Event reference

Every event's payload includes `enquiry_id` (the enquiry it happened on)
plus the object described below. Objects are the same JSON shape as their
REST serializer (`TouchpointSerializer`, `MeetingSerializer`, etc.) — see
`salesport_backend/crm/serializers.py` for the authoritative field list.

| Event | Fires when | Payload (beyond `enquiry_id`) | Target rooms |
|---|---|---|---|
| `touchpoint:created` | `POST /enquiries/{id}/log_touchpoint/` succeeds | `touchpoint`: full Touchpoint object | `role:admin`, `user:{owner_id}`, `enquiry:{id}` |
| `enquiry:status_changed` | `POST /enquiries/{id}/change_status/` succeeds | `status`, `lost_reason`, `enquiry`: full EnquiryDetail object | `role:admin`, `user:{owner_id}`, `enquiry:{id}` |
| `enquiry:round_logged` | `POST /enquiries/{id}/log_round/` succeeds | `negotiation_round`: full NegotiationRound object | `role:admin`, `user:{owner_id}`, `enquiry:{id}` |
| `meeting:created` | `POST /meetings/` succeeds (only if the meeting has `enquiry` set — a meeting can be booked with no linked enquiry, in which case nothing is emitted) | `meeting`: full Meeting object | `role:admin`, `user:{owner_id}`, `enquiry:{id}` |
| `meeting:updated` | `POST /meetings/{id}/reschedule/` succeeds (same `enquiry`-optional caveat as above) | `meeting`: full Meeting object | `role:admin`, `user:{owner_id}`, `enquiry:{id}` |
| `proposal:created` | `POST /proposals/` succeeds | `proposal`: full Proposal object | `role:admin`, `user:{owner_id}`, `enquiry:{id}` |

### Payload examples (captured from a live run)

```jsonc
// touchpoint:created
{
  "enquiry_id": 151,
  "touchpoint": {
    "id": 439, "enquiry": 151, "channel": "Call", "outcome": "Positive",
    "note": "...", "next_action": "", "next_action_date": null,
    "sentiment": "", "direction": "", "duration_sec": null, "subject": "",
    "is_private": false, "created_by": 1, "created_by_name": "Abhishek Mishra",
    "created_at": "2026-07-09T14:27:45.190852+05:30"
  }
}

// enquiry:status_changed
{
  "enquiry_id": 151,
  "status": "Qualified",
  "lost_reason": "",
  "enquiry": { /* full EnquiryDetail — same shape as GET /enquiries/{id}/ */ }
}

// enquiry:round_logged
{
  "enquiry_id": 151,
  "negotiation_round": {
    "id": 153, "enquiry": 151, "side": "Customer ask", "our_quote": "0.00",
    "client_budget": "75000.00", "client_offer": "0.00", "discount_pct": "0.00",
    "round_date": "2026-07-09", "status": "Open", "gap": 0, "note": "...",
    "created_by": 1, "created_by_name": "Abhishek Mishra",
    "created_at": "2026-07-09T14:31:26.081022+05:30"
  }
}

// meeting:created / meeting:updated (same Meeting shape either way)
{
  "enquiry_id": 151,
  "meeting": {
    "id": 109, "enquiry": 151, "company": 29, "company_name": "Audit Test Foods",
    "purpose": "...", "mode": "Online", "scheduled_at": "2026-08-05T15:30:00+05:30",
    "duration_min": 30, "location": "", "consultant": null, "status": "Scheduled",
    "notify_email": false, "notify_whatsapp": false, "message": "",
    "email_subject": "", "email_body": "", "whatsapp_message": "",
    "reschedule_reason": "...", "outcome_sentiment": "",
    "decision_maker_present": null, "outcome_notes": "",
    "created_at": "2026-07-09T14:28:47.835951+05:30"
  }
}

// proposal:created
{
  "enquiry_id": 151,
  "proposal": {
    "id": 90, "enquiry": 151, "title": "...", "amount": "50000.00",
    "status": "Sent", "file_url": "", "sent_at": null,
    "created_at": "2026-07-09T14:30:47.960355+05:30"
  }
}
```

## Pre-existing events (unchanged, not part of this contract update)

These existed before the per-action events above and still fire exactly as
before — nothing about them changed.

| Event | Fires when | Payload | Target rooms |
|---|---|---|---|
| `notification` | A `Notification` row is created (new enquiry, status change, deal won, etc.) | Full `NotificationSerializer` object | Recipient-specific: `user:{recipient_id}`, or `role:admin`/`role:consultant`/both depending on `audience` |
| `enquiry_updated` | Enquiry created, status changed, or reassigned | `{ enquiry_id, lead_id, event }` — `event` is one of `"created"` / `"status_changed"` / `"reassigned"`. Deliberately minimal; clients refetch. | `role:admin`, `user:{owner_id}` |

`enquiry_updated` is a broad "something about this enquiry changed, go
refetch the list" signal. The six events above are the finer-grained,
payload-carrying replacement for anyone that needs to react to a specific
kind of change on a specific enquiry without a round-trip.
