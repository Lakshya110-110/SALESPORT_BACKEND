# Khwaishein — Enterprise Lead Management CRM (Backend)

Django + DRF backend that powers the **web admin console** and the **mobile field app**
mockups. Phone + OTP auth, role-aware data (admin / consultant), and endpoints for every
flow the UIs perform.

**Sort String Solutions LLP**

---

## Stack
- Django 5 + Django REST Framework
- JWT auth (`djangorestframework-simplejwt`)
- **MySQL** (Khwaishein's DB) — with a **SQLite** fallback for instant demos
- CORS enabled for the web + mobile clients

---

## Quick start

### Option A — instant demo (SQLite, no MySQL needed)
```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export DB_ENGINE=sqlite          # Windows: set DB_ENGINE=sqlite
python manage.py migrate
python manage.py seed_demo
uvicorn salesport.asgi:application --reload
```

### Option B — MySQL (production-like, Khwaishein's current DB)
1. `pip install -r requirements.txt`  (installs `mysqlclient`; needs `default-libmysqlclient-dev` on Linux)
2. Create the DB: `CREATE DATABASE salesport_crm CHARACTER SET utf8mb4;`
3. Copy `.env.example` → `.env` and fill the `DB_*` values.
4. `python manage.py migrate && python manage.py seed_demo && uvicorn salesport.asgi:application --reload`

Server runs at `http://127.0.0.1:8000`.

**Always run via `uvicorn salesport.asgi:application`, never `manage.py runserver`.**
`runserver` is WSGI-only — it serves the REST API fine but can't serve
`/socket.io/` at all, so any realtime client (web or mobile) will fail to
connect with no obvious error on the Django side. `salesport/asgi.py`
mounts both the Django REST app and the Socket.IO server together; only
an ASGI server can run it. Add `--host 0.0.0.0` instead of the default
`127.0.0.1` if another device (a phone, another machine on the LAN) needs
to reach this server.

### Demo credentials (after `seed_demo`)
- **Admin:** phone `9876543210` (Abhishek Mishra)
- **Consultants:** `9876500001`–`9876500005` (Ravi, Sneha, Priya, Arjun, Karan)
- In dev, `request-otp` returns the OTP in the response (`OTP_RETURN_IN_RESPONSE=True`).

---

## Auth flow (matches both logins)
```
POST /api/auth/request-otp/   { "phone": "9876543210" }            -> { "otp": "123456" }  (dev)
POST /api/auth/verify-otp/    { "phone": "...", "code": "123456", "role": "admin" }
                              -> { "access", "refresh", "user" }
POST /api/auth/refresh/       { "refresh": "..." }                  -> { "access" }
GET  /api/auth/me/            (Bearer token)                        -> current user
```
Send `Authorization: Bearer <access>` on all `/api/` calls.

---

## Endpoints

| Resource | Endpoint | Notes |
|---|---|---|
| Dashboard | `GET /api/dashboard/` | KPIs, pipeline value, by-stage; admins also get by-consultant + unassigned |
| Enquiries | `GET/POST /api/enquiries/` | filters: `?status=&source=&industry=&enquiry_type=&owner=`; consultants scoped to own |
| Enquiry detail | `GET /api/enquiries/{id}/` | nested touchpoints, negotiation rounds, proposals, meetings |
| Log touchpoint | `POST /api/enquiries/{id}/log_touchpoint/` | `{channel, outcome, note, next_action}` |
| Change status | `POST /api/enquiries/{id}/change_status/` | `{status}` — fires notifications (deal_won on Won) |
| Log neg. round | `POST /api/enquiries/{id}/log_round/` | `{our_quote, client_budget, client_offer}` |
| Reassign | `POST /api/enquiries/{id}/reassign/` | `{owner}` — **admin only** |
| Companies | `GET/POST /api/companies/` | `?industry=` filter |
| Contacts | `GET/POST /api/contacts/` | `?company=` filter |
| Meetings | `GET/POST /api/meetings/` | `?when=upcoming|past`; `POST {id}/reschedule/` |
| Proposals | `GET/POST /api/proposals/` | |
| Users | `GET /api/users/` | create/edit **admin only** |
| Notifications | `GET /api/notifications/` | role-aware feed; `POST /notifications/mark_all_read/` |
| Master data | `GET /api/master-data/?category=industry` | industries / sources / statuses / types / modes |

All list endpoints support `?search=` and `?ordering=`.

---

## Roles
- **Admin** — sees all enquiries/meetings, gets approval + discrepancy notifications, can reassign and manage users.
- **Consultant** — scoped to their own enquiries and meetings; consultant-focused notifications.

Enforced server-side (see `crm/permissions.py` and the `get_queryset` scoping in `crm/views.py`).

---

## Connecting the mockups
Point the web console and mobile app at this API base URL. The phone+OTP screens map to
`request-otp` / `verify-otp`; store the returned `access` token and send it as a Bearer header.
The dashboard, enquiry list/detail, meetings, proposals, and notifications screens each map to
the endpoints above.

## Project layout
```
salesport_backend/
├── manage.py
├── requirements.txt
├── .env.example
├── salesport/          # project (settings, urls, wsgi/asgi)
└── crm/                # app: models, serializers, views, permissions, seed_demo
```
