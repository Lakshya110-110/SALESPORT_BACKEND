# PROJECT_CONTEXT.md — Khwaishein CRM (Sort String Solutions)

> Handoff document for moving to a new machine / starting a fresh Claude Code session.
> Written 2026-07-13. Read this before touching anything else in this directory.

---

## 0. READ THIS FIRST — there are two unrelated projects in this workspace

`D:\lakshya\Claude` (this directory) contains **`CLAUDE.md`** and **`RESUME.md`**, which describe
themselves as "the governing spec" for a Django backend with apps `accounts/`, `leads/`, `masters/`,
`config/` — a "Lead" model, a "touchpoint spine" seam architecture, RBAC capability flags, a
`ssl_crm` database. **That project is PARKED and is not what you should work on.** It was an earlier
build attempt (Phases 1–5 done, paused 2026-06-29) that was superseded in practice by a second,
simpler build that now has months of active work on it and is what "the CRM" means in every
conversation since. This document describes **that** project — the real, active one — which does
**not** live in this directory at all. If you only read `CLAUDE.md`/`RESUME.md` you will have a
completely wrong mental model of the codebase.

**The active project's code lives in three separate directories, not under `D:\lakshya\Claude`:**

| Directory | What it is | Git remote |
|---|---|---|
| `D:\lakshya\salesport-backend-standalone` | **Canonical backend.** Django + DRF + Socket.IO. This is the one to edit. Also now contains a copy of the frontend under `web/`. | `github.com/Lakshya110-110/SALESPORT_BACKEND` |
| `D:\lakshya\CRM\web` | **Canonical frontend.** Next.js. This is the one that's actually run during dev (`salesport-next` launch config, port 3000). | Part of the `D:\lakshya\CRM` monorepo below |
| `D:\lakshya\CRM\salesport_backend` | A **mirror** of the backend, sent out for Android/Flutter integration. **Locked — see §17.** | Same monorepo as above |
| `D:\lakshya\CRM` (repo root, contains `web/` + `salesport_backend/` + `mobile/` originally) | The original monorepo both of the above came from | `github.com/Lakshya110-110/Salesport_crm` |

The product/CRM tool itself was renamed **"SalesPort" → "Khwaishein"** partway through (display text
only — see §11). Code identifiers, the database name (`salesport_crm`), the GitHub repo names, and
one specific piece of business data (a product SKU literally called "SalesPort (DMS + SFA)" — see
§17) were deliberately **not** renamed.

There is also a third-party **Android/Flutter app** at
`github.com/tanyarawat8791349555-png/Android-__UI`, developed by someone else, that consumes this
same backend's API. It has been investigated read-only in past sessions; it is not this repo and
should not be edited directly — issues found in it get written up as a fix-prompt for its own
developer instead.

---

## 1. Project overview and goals

An **Enterprise Lead Management CRM** for Sort String Solutions LLP (a company that sells DMS+SFA
and related B2B software, primarily to dairy/FMCG businesses in India). It tracks the sales pipeline
end-to-end: enquiries (leads) → meetings → proposals → negotiation → won/lost, plus a unified
activity timeline (touchpoints), follow-up reminders, and role-aware notifications. Two client
surfaces consume one backend: a Next.js web admin console (this repo) and a separately-developed
Flutter mobile app for field consultants (external repo, read-only to us).

## 2. Current architecture

```
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────┐
│  Next.js web app │◄──────►│  Django + DRF backend │◄──────►│    MySQL    │
│  (CRM\web)        │  REST  │  (ASGI via uvicorn)   │         │ salesport_  │
│                  │◄──────►│                        │         │    crm      │
└─────────────────┘ Socket. │  + Socket.IO (realtime)│         └─────────────┘
        ▲            IO       │  + Django-Q2 (jobs)   │
        │                     └───────────┬───────────┘
        │                                 │
┌───────┴─────────┐                       ▼
│ Flutter mobile   │                 ┌──────────┐
│ (external repo,  │                 │  Redis   │
│  read-only to us)│                 │ (Memurai │
└──────────────────┘                 │  locally)│
                                      └──────────┘
```

- **Frontend**: Next.js 14 App Router, TanStack Query for server state, Tailwind for styling, a
  custom design-token system (`src/styles/tokens.css`), Socket.IO client for live updates.
- **Backend**: One Django app (`crm`) behind a thin `salesport` project. DRF `ModelViewSet`s +
  routers for CRUD, hand-written function views for auth/dashboard. JWT auth (`simplejwt`).
  Socket.IO server mounted alongside the ASGI app (`crm/sockets.py`) for realtime push
  (`enquiry:updated`, `meeting:updated`, `user:created`, etc. — see `REALTIME_EVENTS.md`).
- **Database**: MySQL (`utf8mb4`), one plain schema — no soft-delete, no multi-tenant scoping. Falls
  back to SQLite automatically if `DB_NAME` is unset (handy for a from-scratch demo).
- **Cache/broker**: Redis (Memurai on Windows locally) backs both Django's cache and the Django-Q2
  task broker; both gracefully degrade to in-process alternatives (`LocMemCache`, Django-Q2's ORM
  broker) if `CACHE_BACKEND` isn't `redis` — this matters for free-tier hosting, see §16.
- **Background jobs**: Django-Q2. Currently one scheduled job, `notify_overdue_followups` (hourly),
  registered via `python manage.py install_schedules`.
- **Realtime**: `python-socketio` (`AsyncRedisManager` when Redis is available, so multiple web
  replicas can share room state; falls back to Socket.IO's built-in in-memory manager for a
  single-instance deploy).
- **File storage**: local `MEDIA_ROOT` by default; swappable to S3 via `FILE_STORAGE=s3` (code
  present, not currently wired to a real bucket).

## 3. Tech stack and versions

**Backend** (`requirements.txt`):
Django 5.0.6 · djangorestframework 3.15.1 · djangorestframework-simplejwt 5.3.1 ·
django-cors-headers 4.3.1 · uvicorn[standard] 0.32.1 · python-socketio 5.11.4 · gunicorn 23.0.0
(alternative process manager, not the default) · mysqlclient 2.2.4 · django-q2 1.10.0 ·
django-redis 5.4.0 (pinned to 5.x — 6.x needs Django≥5.2) · redis-py 8.0.1 · django-storages 1.14.6 ·
boto3 1.43.40 · whitenoise 6.7.0 · dj-database-url 2.3.0 · python-dotenv 1.0.1

**Frontend** (`web/package.json`):
Next.js 14.2.5 (App Router) · React 18.3.1 · @tanstack/react-query 5.51.11 · react-hook-form 7.52.1 +
@hookform/resolvers 3.9.0 + zod 3.23.8 · recharts 2.12.7 · socket.io-client ^4.8.1 · lucide-react
0.408.0 · date-fns 3.6.0 · Tailwind 3.4.6 · TypeScript 5.5.3

**Infra**: Python 3.12, Node.js (LTS), MySQL 8.4 (Windows service `MySQL84`), Memurai (Redis-compatible,
Windows service `Memurai`).

## 4. Folder structure

**`salesport-backend-standalone/`** (backend root):
```
crm/                        the one Django app
  models.py                 all models (§13)
  views.py                  all viewsets + function views (§14)
  serializers.py            DRF serializers
  permissions.py            IsAdminRole (only custom permission)
  sockets.py                Socket.IO server + emit helpers
  notifications.py          NotificationService — currently a no-op stub (§10)
  otp_delivery.py           swappable OTP delivery interface (§11)
  tasks.py                  Django-Q2 job functions
  admin.py                  Django admin registrations
  management/commands/
    seed_demo.py             wipes + recreates demo enquiry data (NOT idempotent for activity data — see §10)
    install_schedules.py    registers Django-Q2 schedules (idempotent)
  migrations/                11 migrations, 0001 → 0010 (+ __init__)
  tests/                     test_followups.py, test_meetings.py, test_storage.py
salesport/                  project config
  settings.py                single settings file, env-var-driven (§5)
  urls.py, asgi.py, wsgi.py
web/                         a COPY of the frontend (see caveat in §0 table / §19) — not the live dev copy
scripts/render-start.sh     free-tier (Render) boot script — not used by the AWS path
render.yaml                 Render Blueprint for the free-tier deploy
Dockerfile, .dockerignore   AWS-oriented container image
DEPLOY.md                   full deploy guide (AWS path + free-tier Render/Aiven path)
REALTIME_EVENTS.md          Socket.IO event contract
media/                      uploaded files (gitignored except what's already committed)
```

**`CRM/web/`** (frontend root — the live one):
```
src/app/
  (auth)/login/              phone → OTP login screen
  (app)/                     everything behind auth, one folder per module:
    dashboard/ enquiries/ enquiries/[id]/ meetings/ proposals/
    companies/ contacts/ users/ master-data/
  layout.tsx                 root layout + metadata (browser title etc.)
src/components/
  auth/LoginPanel.tsx         two-step phone→OTP form
  dashboard/                  KPI strip, charts, side panels (Why we lose, Top industries)
  enquiry/                    every enquiry-detail modal (log touchpoint, edit, negotiation, etc.)
  meetings/OutcomeModal.tsx
  shell/                      Rail (sidebar), AppShell, header search, notifications bell, keyboard shortcuts
  ui/                         design-system primitives (Button, Modal, Switch, DateField, PhoneField, OtpBoxes...)
src/lib/
  api/client.ts               fetch wrapper — base URL, auth header, 401 refresh-and-retry, error parsing
  api/endpoints.ts            one function per API call
  api/types.ts                TS types mirroring the backend's serializers
  auth/session.ts              localStorage-backed JWT session (with in-memory fallback)
  socket.ts                    Socket.IO client setup
  utils/                       formatting, date helpers, derived-lead-type logic (mirrors backend's HOT/WARM_DAYS)
src/styles/tokens.css          design tokens — SOURCE OF TRUTH is an external mockup HTML file, see the file's own header comment
```

## 5. Environment variables (no secrets — see each var's purpose only)

Backend (`.env`, see `.env.example` / `.env.production.example` for the full annotated list):

| Var | Purpose | Local dev default |
|---|---|---|
| `DEBUG` | Django debug mode; also gates a dozen other defaults below | `True` locally, `False` if unset |
| `SECRET_KEY` | Django secret | insecure dev default — **must** be set for real deploys |
| `ALLOWED_HOSTS` | comma-separated | `*` |
| `DATABASE_URL` | single connection string (Aiven/Render-style) — takes priority over `DB_*` | unset |
| `DB_ENGINE` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` | discrete MySQL config | `mysql` / `salesport_crm` / `root` / — / `127.0.0.1` / `3306` |
| `DB_SSL_MODE` | e.g. `REQUIRED` — needed for managed MySQL (Aiven etc.) | unset (plain connection) |
| `CACHE_BACKEND` | `redis` or anything else → in-process `LocMemCache` | `redis` |
| `REDIS_URL` | | `redis://127.0.0.1:6379/1` |
| `OTP_TTL_SECONDS` | | `300` |
| `OTP_RETURN_IN_RESPONSE` | dev convenience — echoes the OTP in the API response, no SMS gateway wired up yet | `True` if `DEBUG`, else `False` |
| `OTP_TEST_PHONE_NUMBERS` | comma-separated allow-list restricting the echo above | unset (every number echoes) |
| `OTP_PROVIDER` | selects a real SMS gateway once one is implemented — not built yet | unset |
| `CORS_ALLOW_ALL_ORIGINS` | dev-only; forced off when `DEBUG=False` | `True` locally |
| `CORS_ALLOWED_ORIGINS` | comma-separated — the deployed web app's real origin(s) | unset |
| `FILE_STORAGE` | `filesystem` or `s3` | `filesystem` |
| `AWS_STORAGE_BUCKET_NAME` / `AWS_S3_REGION_NAME` / etc. | only used if `FILE_STORAGE=s3` | — |
| `SECURE_SSL_REDIRECT` / `SECURE_HSTS_*` | production-only security headers, all gated on `DEBUG=False` | on in prod |
| `Q_SYNC` | run Django-Q2 tasks synchronously (testing) | `False` |
| `DJANGO_LOG_LEVEL` | | `INFO` |

Frontend (`web/.env.local`, template at `web/.env.local.example`):

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE` | Django API base URL, **must include `/api`**. Points at whatever backend you're running — local (`http://127.0.0.1:8000/api`), or a deployed one. **A stale/wrong value here is the #1 cause of a `TypeError: Failed to fetch` on login** — see §10. |

## 6–7. Implementation status / completed features

Essentially the full CRM feature set is built and has been through multiple usability/bug-audit
passes (see the long completed-tasks history in this session). Completed:

- Phone + OTP + JWT auth, role-aware (`admin` / `consultant`), `/api/auth/me/`.
- Enquiries: full CRUD, filters (status/type/industry/source/date/stalled/my-queue), search, sort,
  bulk actions, derived Hot/Warm/Cold typing, requirement/solution-type editing.
- Unified touchpoint timeline per enquiry (Call/WhatsApp/SMS/Email/Note/Meeting/Negotiation), with
  structured fields (sentiment, direction, duration, subject, private flag).
- Meetings: schedule/reschedule (with email + WhatsApp message drafting), outcome logging.
- Proposals: real file upload (validated), status tracking.
- Negotiation rounds: our-quote vs client-offer vs client-budget, gap calc, accept/reject/counter.
- Follow-ups: create/complete/snooze, overdue detection + notification (Django-Q2 hourly job).
- Companies/Contacts/Users/Master Data admin pages.
- Dashboard: KPIs, conversion funnel, pipeline trend, source breakdown, won/lost, "Why we lose".
- Realtime sync over Socket.IO for enquiry/meeting/proposal/negotiation/user changes — see
  `REALTIME_EVENTS.md` for the full event contract.
- Role-aware notifications (bell + popover).
- Keyboard shortcuts, dark/light theme toggle, responsive rail/sidebar.
- Production-readiness pass on the backend: env-var-driven security hardening, WhiteNoise static
  serving, swappable OTP delivery interface, Dockerfile, and a documented free-tier deploy path
  (Render + Aiven) alongside the intended AWS target — see `DEPLOY.md`.
- Project rebrand: display text "SalesPort"/"SalesPort CRM" → "Khwaishein" across the web app and the
  canonical backend (NOT the mirror, NOT the Android app, NOT the `SalesPort (DMS+SFA)` product-data
  value — see §11 and §17).

## 8. Features currently in progress

Nothing has an explicit "in progress, half-built" flag right now — the last working session ended
mid-troubleshoot on a **login `TypeError`** the user hit after a hosting experiment (root-caused once
already to a stale LAN IP in `.env.local`, then reportedly recurred in a different hosting context
that was never fully diagnosed — see §10, this is the most likely first thing to pick back up).

## 9. Planned features / roadmap

Nothing formally scheduled beyond finishing the free-tier/production deploy story and whatever the
user raises next. Known deferred/soft-scoped items:
- A real SMS/OTP provider integration (`crm/otp_delivery.py`'s `ProviderOtpDeliveryService` is a
  stub that raises `NotImplementedError` — implement against MSG91/Twilio/etc. when ready).
- A real WhatsApp/Email outbound provider (`crm/notifications.py`'s `NotificationService` is
  similarly a no-op stub — see settings.py's `WHATSAPP_*`/`EMAIL_*` vars, all currently blank).
- S3 file storage wiring (code exists, `FILE_STORAGE=s3`, never pointed at a real bucket).
- Deciding whether/when to merge `chore/production-readiness` into `main` on the standalone backend,
  and whether/when to push it live (it has NOT been pushed to any real production host as of this
  writing — only exercised on a free Render/Aiven test).
- Mirroring the rename (§11) and the production-readiness work to the locked mirror repo, if the user
  ever unblocks that (see §17).

## 10. Outstanding bugs, limitations, technical debt

- **Login `TypeError` — last reported issue, not fully closed.** First instance: `web/.env.local` had
  `NEXT_PUBLIC_API_BASE` pointed at a stale LAN IP (`192.168.1.34:8080`) instead of a real backend —
  fixed by pointing it at `http://127.0.0.1:8000/api` and running both servers locally (confirmed
  working end-to-end: OTP request → auto-filled dev OTP → verify → dashboard). The user then reported
  it happening again "on main server... when it is being hosted" (message was interrupted/garbled) —
  **this was never actually diagnosed**; next session should ask for the exact URL, the browser
  console error text, and the current `NEXT_PUBLIC_API_BASE` value before assuming it's the same root
  cause. General diagnosis pattern: a raw `TypeError: Failed to fetch` (not an `ApiError`) means the
  `fetch()` call itself never got a response — either CORS blocked it or the target host/port isn't
  reachable at all; it is NOT a backend logic bug in that case.
- **`seed_demo` is destructive, not idempotent for activity data** — its own docstring says it wipes
  and recreates enquiries/touchpoints/meetings/etc. on every run. Never put it in an automated boot
  script (a mistake explicitly avoided in `scripts/render-start.sh` — see that file's comments).
- **Render free-tier deploy limitations** (documented in `DEPLOY.md` §7, only relevant if that path is
  used): no persistent disk (uploaded Proposal PDFs vanish on redeploy/restart), no second free
  process for the Django-Q2 worker (worked around by running `qcluster` and `uvicorn` in the same
  container via `scripts/render-start.sh`), free instance sleeps after ~15 min idle (30–50s cold
  start).
- **Aiven-managed MySQL gotcha (now fixed, but worth knowing)**: Aiven enables
  `sql_require_primary_key` by default, which breaks certain Django migration operations
  (`OperationalError 3750`) — fix is to disable it in Aiven's Advanced Configuration for the initial
  migrate, documented in this session's troubleshooting; not a code issue.
- **`web/` inside the backend repo is a stale snapshot**, not a live copy. It was created once via a
  one-time `robocopy` from `CRM\web` to consolidate both apps into one GitHub repo
  (`SALESPORT_BACKEND`). Edits made to `CRM\web` since that snapshot (e.g. later Users-page UI tweaks)
  have **not** been re-synced into `salesport-backend-standalone\web`. Decide a sync strategy (or drop
  one of the two copies) before they drift further.
- **`D:\lakshya\CRM` monorepo has a backlog of uncommitted changes** sitting on branch
  `chore/remove-mobile-folder` (rename edits, Meetings search/filter, dashboard scrollbar fix, Users
  edit-icon repositioning, etc.) that were never committed because they were mixed in with unrelated
  in-progress work already sitting in that working tree. Needs a deliberate commit pass, not a blanket
  `git add -A`.
- **No real SMS/WhatsApp/Email provider** — see §9. Everything currently either logs-only or echoes
  the OTP in dev mode.
- **`crm/tests/`** only covers follow-ups, meetings, and storage — no test coverage for enquiries,
  auth, dashboard, or realtime events.
- A dev server left running for a very long session (many hot-reload cycles) was observed to get its
  Next.js module cache corrupted (`TypeError: Cannot read properties of null (reading 'useContext')`
  in SSR, on every page). Fix was restarting the `next dev` process, not a code change — worth knowing
  if a fresh session inherits an already-running, long-lived dev server that starts behaving oddly.

## 11. Important design decisions and why

- **Realtime via Socket.IO, not Django Channels** — `crm/sockets.py` mounts a `python-socketio`
  ASGI app alongside DRF. Redis-backed room state (`AsyncRedisManager`) only matters if you ever run
  multiple web replicas; a single instance (e.g. the free-tier deploy) works fine without Redis at all.
- **Django-Q2 over Celery** — simpler ops story (no separate broker service required; can run on the
  ORM as a broker with zero extra infra), used only for the hourly overdue-follow-up sweep so far.
- **Swappable OTP delivery** (`crm/otp_delivery.py`) — `get_otp_delivery_service()` returns
  `DevOtpDeliveryService` (logs + optionally echoes, allow-list gated) or `ProviderOtpDeliveryService`
  (stub) based on `OTP_PROVIDER`. Mirrors the same pattern already used for `NotificationService`.
  Chosen so a real SMS gateway can be dropped in later by implementing one method, no call-site
  changes.
- **Dockerfile over Procfile** for the AWS path — a container is the native deployable unit on AWS
  (ECS/Fargate/App Runner), and the same image still works on Procfile-style PaaS platforms if ever
  needed, so nothing is lost by choosing Docker.
- **`DB_SSL_MODE` as an explicit env var, not parsed from `DATABASE_URL`'s query string** — Aiven's
  connection string includes `?ssl-mode=REQUIRED`, but `dj_database_url` passes that straight into
  Django's `OPTIONS` dict verbatim as a literal `"ssl-mode"` key, which `MySQLdb.connect()` doesn't
  recognize and raises `TypeError` on. `settings.py` explicitly strips that bad key and re-adds the
  correctly-named `ssl_mode` only if `DB_SSL_MODE` is set — this was found and fixed by actually
  simulating the connect() call's kwargs before wiring the real deploy, not by inspection alone.
- **Rename was scoped to display/branding text only** — "SalesPort" → "Khwaishein" was applied to
  browser titles, login screen, sidebar logo, Django admin app label, docstrings/comments, and
  README/DEPLOY.md — but explicitly NOT to: the database name (`salesport_crm`), the GitHub repo
  names, Python module/package names (`salesport/` project folder), or the `SOLUTION_TYPE_CHOICES`
  value `"SalesPort (DMS + SFA)"` in `crm/models.py` (that string names a real product Sort String
  sells — see the comment directly above it in the model — it is business data, not the CRM tool's
  own name, and renaming it would misrepresent what the CRM tracks). The historical migration file
  that snapshots that same choices list was also left untouched, per general practice of not editing
  applied migrations.
- **`lead_id` generation is a plain "last row + 1" scheme** (`Enquiry.save()`), not
  `SELECT ... FOR UPDATE`-guarded — fine at current traffic; would need hardening under real
  concurrent write load (this is a known simplification, not an oversight to silently "fix" without
  flagging it — a race here could produce two enquiries with the same `lead_id`, only prevented by
  the `unique=True` backstop causing one to fail outright rather than silently collide).

## 12. Coding conventions and standards

- One Django app (`crm`); views stay reasonably thin, using DRF `ModelViewSet`s + `@action` for
  custom endpoints; no separate service layer currently (unlike the parked project's stricter
  service-layer rule in §0 — that rule was never carried over to this codebase).
- Every setting is env-var driven with a sane local-dev default (`env()`/`env_bool()`/`env_list()`
  helpers at the top of `settings.py`); production-only behavior is gated on `if not DEBUG:` blocks,
  never a separate settings file.
- Comments explain **why**, not what — this is enforced fairly strictly throughout `settings.py`,
  `otp_delivery.py`, `render-start.sh`, etc. Follow that pattern for new code.
- Frontend: one page per route under `src/app/(app)/`, shared modals/widgets under `src/components/`,
  all API calls go through `src/lib/api/endpoints.ts` (never raw `fetch` in a component), all types
  mirror the backend's serializer shape in `src/lib/api/types.ts`.
- Repeated small UI patterns (e.g. the `SearchPill`/`FilterChip` combo used on Enquiries and Meetings)
  are currently **copy-pasted per page**, not extracted into a shared component — replicate the
  existing pattern for consistency rather than introducing a new one, but a shared extraction would be
  a reasonable cleanup if touching three or more pages that need it.
- Git: prefer new commits over amends; never `--no-verify`; confirm before any push (established
  practice throughout this project's history — always ask, even though the user has said "push it"
  freely once asked).

## 13. Database schema (key models, `crm/models.py`)

- **`User`** (custom, `AUTH_USER_MODEL`) — phone-based login (`USERNAME_FIELD = "phone"`), `role`
  (`admin`/`consultant`), `avatar_color`, `is_staff`/`is_superuser` for Django admin only (unrelated
  to the CRM's own role field).
- **`OTP`** — phone + 6-digit code + TTL check (`is_valid`).
- **`MasterData`** — generic category/value/label lookup table (industries, sources, statuses,
  enquiry types, meeting modes), unique per `(category, value)`.
- **`Company`** / **`Contact`** — straightforward, contact FKs to company.
- **`Enquiry`** (the "Lead") — `lead_id` (auto `LEAD-<year>-<seq>`, unique), status/type/source,
  `solution_type` (+ `solution_type_other` for "Other"), `expected_value`/`expected_close_date`,
  `owner` FK to User, `derived_type` property (Hot/Warm/Cold from days-to-close, `HOT_DAYS=14`,
  `WARM_DAYS=45` — **must stay in sync with `web/src/lib/utils/leadType.ts`**), `STALE_DAYS=3` for the
  "stalled deal" flag.
- **`Touchpoint`** — the activity-timeline entry. `channel` (Call/WhatsApp/SMS/Email/Note/Meeting/
  Negotiation), plus structured extras (`sentiment`, `direction`, `duration_sec`, `subject`,
  `is_private`) that only apply to certain channels.
- **`NegotiationRound`** — our_quote / client_budget / client_offer / discount_pct / status, `gap`
  property.
- **`FollowUp`** — owner's to-do list item, optional `source_touchpoint` link, `is_overdue` property.
- **`Meeting`** — schedule + mode + status + outcome fields (`outcome_sentiment`,
  `decision_maker_present`, `outcome_notes`) + drafted notification content
  (`email_subject`/`email_body`/`whatsapp_message`) + `reschedule_reason`.
- **`Proposal`** — real `FileField` upload (`proposals/%Y/%m/`) + legacy `file_url` fallback.
- **`Notification`** — role/audience-aware (`admin`/`consultant`/`all`), typed (`ntype`), generic
  `link_type`/`link_id` pointer back to the source object.

11 migrations applied (`0001_initial` → `0010_...`); no pending migrations as of the last session.

## 14. API endpoints

Base path `/api/`. JWT auth (`Authorization: Bearer <token>`) required everywhere except OTP
request/verify. `IsAdminRole` gates a handful of admin-only actions.

**Auth**
- `POST /api/auth/request-otp/`
- `POST /api/auth/verify-otp/`
- `POST /api/auth/refresh/` (simplejwt `TokenRefreshView`)
- `GET /api/auth/me/`

**Dashboard**
- `GET /api/dashboard/`

**Resources** (all standard DRF router CRUD — list/create/retrieve/update/partial_update/destroy —
plus the custom actions listed):
- `/api/enquiries/` — custom: `POST {id}/log_touchpoint/`, `POST {id}/change_status/`,
  `POST {id}/log_round/`, `POST {id}/reassign/` (admin-only)
- `/api/companies/`
- `/api/contacts/`
- `/api/meetings/` — custom: `POST {id}/reschedule/`
- `/api/proposals/`
- `/api/follow-ups/` — custom: `POST {id}/complete/`, `POST {id}/snooze/`
- `/api/users/`
- `/api/notifications/` — custom: `POST mark_all_read/`
- `/api/master-data/`

All endpoints are believed functional and exercised via the frontend; no known-broken endpoints as of
last session. `/admin/` (Django admin) is also mounted.

## 15. Commands

**Backend** (from `salesport-backend-standalone/`, venv already created at `venv/`):
```bash
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py install_schedules      # registers the overdue-followup schedule (idempotent)
python manage.py seed_demo              # WARNING: wipes + recreates enquiry activity data — one-off only, never automate
python manage.py createsuperuser        # only needed for /admin/, not for the CRM's own login
venv\Scripts\uvicorn.exe salesport.asgi:application --host 127.0.0.1 --port 8000 --reload
python manage.py qcluster                # background worker, separate process, needed for follow-up notifications
python manage.py test                    # crm/tests/ — follow-ups, meetings, storage
```
Do **not** use `manage.py runserver` for real work — it's WSGI-only and can't serve `/socket.io/`.

**Frontend** (from `CRM/web/`):
```bash
npm install
npm run dev          # port 3000, Turbopack
npm run build && npm run start
npm run lint
npm run typecheck
```

**Local infra**: MySQL84 and Memurai are Windows services — `Get-Service MySQL84,Memurai` to check,
`Start-Service` if stopped. Both were confirmed running throughout the last session.

**Deploy** — see `DEPLOY.md` in the backend repo for the full walkthrough of both paths (AWS-oriented
Docker path, and the free-tier Render+Aiven path actually exercised this session).

## 16. External services and integrations

- **MySQL** — local (`MySQL84` service) for dev; **Aiven** free-tier MySQL was set up and used for a
  Render hosting test (`mysql-10534718-lakshyagaut-e664.f.aivencloud.com`, requires
  `DB_SSL_MODE=REQUIRED`).
- **Redis/Memurai** — local only so far; not required for the free-tier deploy (see §11).
- **Render** — free Web Service (Docker) used for a hosting test of the backend; `render.yaml` +
  `scripts/render-start.sh` in the repo. **Not confirmed as the permanent target** — CLAUDE.md-derived
  convention says AWS is the real target; Render was explicitly "just to test it out first" per the
  user.
- **No SMS/WhatsApp/Email provider wired up yet** — see §9/§10.
- **GitHub** — three separate remotes in play, do not confuse them:
  - `Lakshya110-110/SALESPORT_BACKEND` — the canonical backend (+ frontend copy under `web/`).
  - `Lakshya110-110/Salesport_crm` — the original monorepo (web + locked backend mirror + originally
    a `mobile/` folder, since removed from the repo).
  - `Lakshya110-110/hit_yatra` — **unrelated** side project (a separate marketing site), not part of
    this CRM at all; mentioned here only so it isn't confused with the above two.

## 17. Assumptions and business rules that must not be changed without asking

- **Never generate or store human-login passwords/secrets.** Hand the user the exact command to run
  themselves. This applies to `createsuperuser`, database passwords, API keys — everything.
- **`D:\lakshya\CRM\salesport_backend` (the mirror) is LOCKED.** Do not modify anything in it — code,
  migrations, seed data, settings, `.env`, or its running server process — without first telling the
  user exactly what change is needed and why, and getting explicit confirmation. Reason: this backend
  was sent out to integrate with the Android/Flutter app; an unannounced change could break that
  integration. This restriction does **not** cover `D:\lakshya\CRM\web` (the frontend) unless the user
  says otherwise.
- **"Sort String Solutions LLP" is the company name and was never part of the rename.** Only the CRM
  product's own branding ("SalesPort"/"SalesPort CRM") became "Khwaishein".
- **`"SalesPort (DMS + SFA)"` in `SOLUTION_TYPE_CHOICES` is real business data** — an actual product
  Sort String sells — and must not be renamed even though the CRM tool itself was.
- **Migrations are never edited after being applied/committed** — add a new migration instead.
- **The Android/Flutter app repo is never edited directly.** Issues found in it are written up as a
  detailed fix-prompt for its own developer instead.
- **Two backend copies (`salesport-backend-standalone` and `CRM\salesport_backend`) are conventionally
  kept in sync for genuine bug fixes** (e.g. the meeting-reschedule datetime bug was fixed in both) —
  but this was NOT done for the production-readiness/deploy-specific work, which only applies to the
  standalone repo, and per the lock above, syncing to the mirror needs explicit sign-off first anyway.
- **Confirm before every `git push`**, even to repos the user has pushed to before in the same
  session — approval is per-action, not standing.

## 18. Prioritized TODO / next steps

1. **Diagnose the still-open login `TypeError`** reported "on main server... when hosted" — get the
   exact URL, browser console error, and current `NEXT_PUBLIC_API_BASE` before assuming it's the same
   stale-IP root cause as the earlier, already-fixed instance.
2. **Decide the `web/` drift**: either re-sync `salesport-backend-standalone/web` from `CRM/web`, or
   stop treating the copy inside the backend repo as meaningful and document that `CRM/web` is the
   only real one.
3. **Commit the backlog of uncommitted changes** sitting in `D:\lakshya\CRM` (rename edits, Meetings
   filter, dashboard scrollbar, Users edit-icon change) — currently mixed with unrelated in-progress
   work on `chore/remove-mobile-folder`; needs a deliberate, scoped commit.
4. **Decide on `chore/production-readiness`**: merge into `main` on the standalone backend, or keep it
   separate. It's currently ahead of `main` with the OTP delivery service, security hardening, Docker,
   and the free-tier deploy files.
5. **Delete the sensitive DB dump** if it's still on disk from earlier work (a full `mysqldump` was
   generated to a `.sql` file outside any git repo — flagged for deletion once no longer needed;
   deletion was never confirmed).
6. Pick a real SMS/OTP provider and implement `ProviderOtpDeliveryService.send_otp()` when ready to
   go beyond dev-mode OTP echoing.
7. Decide whether the Render/Aiven free-tier path becomes a real staging environment or stays a
   one-off test, and whether to actually start the AWS deploy work `DEPLOY.md` documents but was never
   executed against real AWS infra.

## 19. Summary of recent work (this session, roughly chronological)

1. Diagnosed and fixed a real backend bug: meeting reschedule wasn't parsing the new datetime
   (raw string assignment instead of `parse_datetime()`), causing time-only desync between web and
   Android; also fixed a missing realtime emit on meeting edit/outcome PATCH. Applied to both backend
   copies.
2. Diagnosed (but did not fix — per explicit instruction, wrote a fix-prompt instead) two Android-side
   bugs: a "log touchpoint" button calling the wrong local method, and 8 API-response converters
   missing `.toLocal()` after `DateTime.tryParse()` on timezone-offset strings.
3. Small UI fixes on the web app: dashboard "Why we lose" card fixed height + scrollbar; Meetings page
   got a search box + Status/Mode filter chips (backend already supported the query params).
4. Generated a full MySQL dump for the user (password never printed — used `MYSQL_PWD` env var), and
   helped install/configure MySQL Workbench.
5. **Large production-readiness pass** on the standalone backend: env-var-driven `DEBUG`/security
   settings, WhiteNoise static serving, `DATABASE_URL` support via `dj-database-url`, JSON-only DRF
   renderer in production, the swappable OTP delivery interface (`crm/otp_delivery.py`), a Dockerfile,
   and `DEPLOY.md` — everything genuinely verified against a real running process under
   production-like config, not just claimed. Committed to `chore/production-readiness`, not pushed at
   the time.
6. **Rebranded** "SalesPort"/"SalesPort CRM" → "Khwaishein" (display text only) across the web app and
   the standalone backend — see §11 for exactly what was and wasn't touched. Verified live in-browser.
   Pushed `main` to GitHub.
7. **Free-tier hosting setup**: researched current (2026) free-hosting options, chose Render (Docker
   web service) + Aiven (free MySQL), built `render.yaml` + `scripts/render-start.sh` (runs the
   Django-Q2 worker and the web process in one container, since Render's free plan gives one process),
   added `DB_SSL_MODE` support. Caught and fixed a real bug before it shipped — Aiven's connection
   string's `?ssl-mode=REQUIRED` query param would have broken `MySQLdb.connect()` — verified by
   simulating the actual connect() kwargs, not just by inspection. Walked the user through Aiven
   signup, Render Blueprint creation, a `startCommand`→`dockerCommand` field-name fix, and an Aiven
   `sql_require_primary_key` migration failure (fixed via Aiven's Advanced Configuration panel).
8. **Consolidated the frontend into the backend repo**: copied `CRM/web` into
   `salesport-backend-standalone/web` (excluding `node_modules`/`.next`/env files), pushed to `main`,
   merged into `chore/production-readiness`, excluded `web/` from the Docker build context.
9. Small UI fixes on Users page: made the edit icon a proper symmetric 32×32 hit-box (was a bare
   14px glyph), then moved it into its own "EDIT" column between Role and Active.
10. **Debugged a login `TypeError`**: root-caused to `web/.env.local`'s `NEXT_PUBLIC_API_BASE` pointing
    at a stale LAN IP. Set up both servers to run locally (added a `salesport-standalone-backend`
    launch config, fixed the env var), verified the full login flow end-to-end in-browser. User then
    reported the error recurring "on main server... hosted" — **this second report was never
    diagnosed** (see §18 item 1).
11. Uploaded an unrelated side project ("Hit Yatra") to a new GitHub repo — not part of this CRM,
    mentioned only to avoid confusion if referenced later.
12. This document.

## 20. What a new Claude Code session needs to know, beyond the above

- **Always check which of the three repos you're in before running git commands** — `git remote -v`
  first. It is very easy to think you're in the canonical backend when you're actually in the locked
  mirror, or vice versa.
- **The locked-mirror restriction (§17) has bitten this project before in spirit** — always ask
  before touching `CRM\salesport_backend`, even for something that feels "safe" like a comment or a
  seed-data tweak.
- **`.claude/launch.json` files are per-directory**, not shared — `D:\lakshya\Claude\.claude\
  launch.json` has entries for the Django dev server, the locked mirror's backend (port 8001), the
  canonical standalone backend (`salesport-standalone-backend`, port 8000), and the frontend
  (`salesport-next`, port 3000). Use `preview_start`/the Browser pane tools to run dev servers, never
  raw `Bash`/`PowerShell` — this was the established practice throughout the session.
- **When something "isn't working," get the exact error text before touching code.** Several bugs
  this session (the Aiven SSL kwarg, the stale-IP login error, the Render `startCommand` field name)
  were found by actually reading logs/simulating the failing call, not by guessing from a vague "it's
  broken" report — and one vague report (§10, item 1) is still unresolved specifically because the
  detail wasn't captured before the conversation moved on.
- **This document itself may drift** — treat §8/§9/§18 (in-progress, planned, TODO) as the parts most
  likely to be stale by the time you read this; verify against actual git log / running state before
  assuming they're current.
