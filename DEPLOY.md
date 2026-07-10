# Deploying the Khwaishein backend

This covers taking the Django/DRF + Socket.IO backend from local dev to a
real production host. It doesn't cover *which* AWS service to run the
container on (ECS/Fargate, App Runner, EC2 — any of them work identically
from the app's point of view) — just what the app itself needs from its
environment, and the exact commands to run it.

## 1. Required environment variables

Full reference with comments: **`.env.example`**. The essentials for a real
deploy:

| Variable | Required | Notes |
|---|---|---|
| `SECRET_KEY` | Yes | Generate one, don't reuse the dev default. |
| `DEBUG` | No | Leave unset — defaults to `False`. |
| `ALLOWED_HOSTS` | Yes | Your real API domain, e.g. `api.salesport.example.com`. |
| `DATABASE_URL` **or** `DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_HOST`/`DB_PORT` | Yes | Either form works — see `.env.example`. |
| `REDIS_URL` | Yes | Cache + Django-Q2 broker + Socket.IO pub/sub. |
| `CORS_ALLOWED_ORIGINS` | Yes | The web app's real origin(s) — e.g. your Vercel URL. Comma-separated, no trailing slash. |
| `OTP_RETURN_IN_RESPONSE` | Recommend explicit `False` | Defaults to `False` when `DEBUG` isn't set, but set it explicitly so it's not relying on that default. |
| `OTP_TEST_PHONE_NUMBERS` | Only if you need test logins pre-SMS-provider | See §5 below. |
| `FILE_STORAGE` + `AWS_*` | Only if using S3 | Leave `FILE_STORAGE` unset for local-disk uploads. |

None of these have real values committed anywhere in the repo — set them on
whatever AWS service runs the container (ECS task definition env vars /
Secrets Manager, App Runner env vars, etc.).

## 2. Run commands

The same image runs both processes; which one depends only on the command:

```bash
# Web — serves REST + Socket.IO on the same port.
uvicorn salesport.asgi:application --host 0.0.0.0 --port $PORT

# Worker — Django-Q2, processes Follow-up/notification background tasks.
python manage.py qcluster
```

Run at least one of each. `$PORT` is whatever your platform injects (AWS App
Runner, Render, Railway, Heroku-likes all do this); falls back to `8000` if
unset (baked into the Dockerfile's `CMD`, so a plain `docker run` with no
`PORT` set still works).

**Why plain `uvicorn` and not `gunicorn -k uvicorn.workers.UvicornWorker`:**
both are in `requirements.txt` and either works — we default to plain
uvicorn for one less moving part. Reach for gunicorn's worker manager instead
if you need its more mature graceful-restart/worker-timeout handling under
real production load; swapping is just changing this one command, nothing
in the app changes either way.

**Multiple web replicas are safe.** Socket.IO's room state (who's connected,
which `enquiry:{id}` rooms they've joined) is backed by Redis
(`AsyncRedisManager`, already wired in `crm/sockets.py`) specifically so an
`emit()` reaches a client regardless of which replica holds their actual
WebSocket connection. Scale `--workers N` or replica count freely as long as
every replica points at the same `REDIS_URL`.

## 3. Release steps (run once per deploy, against the real environment)

```bash
python manage.py migrate
python manage.py collectstatic --noinput   # already run at build time too;
                                            # rerun here in case env-specific
                                            # settings (e.g. S3) change what
                                            # gets collected
python manage.py createsuperuser           # first deploy only
```

Run these as a one-off task/job against the real database — not inside the
Dockerfile (baked-in migrations would run against whatever DB was reachable
at *build* time, not the real one, and would race across multiple replicas
starting up together). Most AWS deploy pipelines have a dedicated slot for
this (ECS: a one-off task using the same image before the service updates;
App Runner: a pre-deploy hook or a manual step).

`createsuperuser` will prompt for a phone number and password interactively
— run it yourself in a real terminal against the real environment. Nothing
here generates or stores that password for you.

## 4. Pointing the web app (Vercel) and Android at this backend

Once deployed behind a domain with TLS (ALB + ACM cert, CloudFront, or
whatever terminates HTTPS in front of the container):

- **REST API base:** `https://api.salesport.example.com/api`
- **Socket.IO:** `wss://api.salesport.example.com/socket.io/` — same host,
  same port, no separate service. The web client (`web/src/lib/socket.ts`)
  and the Android client (`RealtimeClient` in `lib/api/realtime_client.dart`)
  both already derive the Socket.IO origin from the REST API base URL by
  stripping `/api` — set `NEXT_PUBLIC_API_BASE` (web) / `API_BASE_URL`
  (Android's `--dart-define`) to the `https://` URL above and both REST and
  realtime pick up the right host automatically. `wss://` is just `https://`
  upgraded by the browser/socket.io-client — no separate config needed as
  long as the whole path (proxy included) supports WebSocket upgrades.

**Reverse proxy note:** if AWS ALB or another proxy sits in front, it must
allow WebSocket upgrade on the same listener/target group as the rest of the
traffic (ALB does this by default on HTTP/HTTPS listeners — nothing extra to
configure there). `SECURE_PROXY_SSL_HEADER` (set automatically when
`DEBUG=False`, see `settings.py`) tells Django to trust the proxy's
`X-Forwarded-Proto` header for its own HTTPS detection.

## 5. OTP delivery — no SMS provider yet

See `crm/otp_delivery.py` for the full interface. Two states, switched by
environment variables — no code change either way:

**(a) Right now, before a provider is wired up:**

Set `OTP_RETURN_IN_RESPONSE=True` and `OTP_TEST_PHONE_NUMBERS` to a
comma-separated list of your team's real test numbers:

```
OTP_RETURN_IN_RESPONSE=True
OTP_TEST_PHONE_NUMBERS=9876543210,9123456789
```

Only those numbers get the OTP echoed back in the `/api/auth/request-otp/`
response. Every other phone number still gets a normal "OTP sent" response
with no code in it — the code is only visible in the server logs
(`crm.otp_delivery` logger, always logs regardless of the env vars above),
which is fine for a small internal pilot but isn't a real delivery
mechanism. If you don't need real users logging in yet, just leave
`OTP_RETURN_IN_RESPONSE=False` (or unset) entirely — nothing echoes to
anyone, full stop.

**(b) Once you have a real SMS provider (MSG91, Twilio, etc.):**

1. Implement `ProviderOtpDeliveryService.send_otp()` in
   `crm/otp_delivery.py` against that provider's HTTP API. It currently
   raises `NotImplementedError` with a pointer back to this file — that's
   the only thing to fill in.
2. Add whatever credentials it needs (e.g. `MSG91_API_KEY`) to
   `settings.py` and your environment, alongside the existing
   `OTP_PROVIDER` var.
3. Set `OTP_PROVIDER=msg91` (or whatever you named it) in the environment.
   `get_otp_delivery_service()` switches to the real implementation
   automatically — `crm/views.py`'s `request_otp` view doesn't change.
4. Set `OTP_RETURN_IN_RESPONSE=False`. Real numbers get a real SMS; nothing
   is ever echoed in the API response again.

## 6. Verified locally (production-like: `DEBUG=False`, real env vars, under uvicorn)

Ran on a separate port against the real MySQL database, with
`DEBUG=False`, a real `SECRET_KEY`, `ALLOWED_HOSTS=127.0.0.1,localhost`,
`CORS_ALLOWED_ORIGINS=http://localhost:3000`, `OTP_RETURN_IN_RESPONSE=True`
+ `OTP_TEST_PHONE_NUMBERS=<one test number>`, under
`uvicorn salesport.asgi:application`. Requests sent with
`X-Forwarded-Proto: https` to simulate sitting behind a TLS-terminating
proxy (matching `SECURE_PROXY_SSL_HEADER`), since there's no real proxy to
terminate TLS locally.

- [x] **API responds** — `GET /api/dashboard/` returns real data (60
      enquiries, pipeline value, stage breakdown) with a valid JWT.
- [x] **Auth works, and the OTP allow-list does exactly what it should** —
      requested an OTP for the allow-listed test number: echoed in the
      response (`{"otp":"952932", ...}`). Requested one for a different,
      non-allow-listed number: **not** echoed
      (`{"detail":"OTP sent","phone":"9999999999"}`, no `otp` key) — but
      still visible in the server log (`OTP [dev, no SMS gateway
      configured] phone=9999999999 code=...`), confirming ops can still
      retrieve it pre-provider without it leaking over the API. Verified
      the full round-trip through `verify-otp` → JWT → an authenticated
      `/api/dashboard/` call.
- [x] **Static serves** — `collectstatic` ran clean (162 files copied, 466
      post-processed by WhiteNoise's compressed-manifest storage).
      `/static/rest_framework/css/bootstrap.min.css` returned 200 with
      `Cache-Control: max-age=60, public` for the plain filename (short
      cache — correct, since that exact path could change on redeploy;
      WhiteNoise gives the hashed/versioned filenames from the manifest a
      far-future immutable `Cache-Control` instead, which is what actually
      gets referenced from rendered HTML/JS).
      Caveat: Django's ASGI handler logs a harmless warning
      (`StreamingHttpResponse must consume synchronous iterators...`) when
      WhiteNoise serves a file under uvicorn — WhiteNoise falls back to
      sync iteration, which still works correctly (confirmed by the 200s
      above), just not fully async. Negligible for admin/DRF-browsable-API
      assets; would be worth a look if this app ever served large
      user-facing static files at high concurrency, which it doesn't.
- [x] **A Socket.IO client connects** — authenticated with the real JWT
      from the OTP flow above, connected successfully
      (`polling` transport, `X-Forwarded-Proto: https`), confirmed
      `sio.connected == True`.
- [x] **A background task runs for real** — started an actual `qcluster`
      worker (not simulated) against the same Redis broker, enqueued the
      app's real scheduled job (`crm.tasks.notify_overdue_followups`, the
      hourly overdue-follow-up notifier registered by
      `manage.py install_schedules`) via `async_task()`, and confirmed the
      worker log shows `Processed 'crm.tasks.notify_overdue_followups'`.
- [x] **Browsable API is JSON-only with `DEBUG=False`** — a request with
      `Accept: text/html` got a 406 (`"Could not satisfy the request
      Accept header"`) instead of the HTML form UI, confirming
      `DEFAULT_RENDERER_CLASSES` correctly drops `BrowsableAPIRenderer` in
      production rather than silently falling back to it.
- [x] Confirmed the safety warnings actually fire: ran once with
      `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS` left unset under
      `DEBUG=False` and got the expected `RuntimeWarning`s at startup
      pointing at exactly what to fix.

**Can't be verified without a real host:**

- `SECURE_SSL_REDIRECT`'s actual HTTP→HTTPS redirect — confirmed the
  setting is present and `True` when `DEBUG=False` (and confirmed it
  fires: a plain HTTP request with no `X-Forwarded-Proto` header got a
  301 to an `https://` URL), but the *real* redirect round-trip through a
  TLS-terminating proxy needs a real domain + certificate.
- HSTS header behavior on a real HTTPS response — same reason.
- `wss://` upgrade through a real reverse proxy / load balancer — the raw
  Socket.IO upgrade itself is confirmed working; the TLS-terminated
  `wss://` path specifically through ALB/CloudFront needs the real
  deployed domain.
- S3 file storage (`FILE_STORAGE=s3`) — the code path is unchanged from
  before this work and was already documented as working; wasn't
  re-verified here since it needs a real bucket + credentials.

## 7. Free-tier deploy (Render + Aiven) — good for a demo/staging URL

The stated deploy target is still AWS (§1–6 above) — this section is for
getting a real, reachable URL for free before that, e.g. so the web app or
Android can point at something other than `localhost`.

**Stack:** [Render](https://render.com) free Web Service (Docker) + [Aiven](https://aiven.io/free-mysql-database)
free-forever MySQL. No Redis: `CACHES`, `Q_CLUSTER`, and the Socket.IO
`client_manager` in `salesport/settings.py` / `crm/sockets.py` all already
fall back to non-Redis alternatives (`LocMemCache`, the Django-Q2 ORM broker,
socket.io's built-in in-memory manager) — fine for a single instance, which
is all the free plan gives you anyway.

**Known free-tier limits, going in:**
- Render's free Web Service sleeps after ~15 min idle (30–50s cold start on
  the next request) and has **no persistent disk** — anything written to
  the container's filesystem (uploaded Proposal PDFs under `MEDIA_ROOT`) is
  lost on every redeploy or restart. Fine for a demo; not for real uploads
  until `FILE_STORAGE=s3` is wired to a real bucket.
- Render's free plan doesn't include a second always-on process for a
  worker service, so `scripts/render-start.sh` runs `qcluster` and `uvicorn`
  in the *same* container instead — keeps the overdue-follow-up notifier
  working without a paid plan. (This script isn't used by the AWS path,
  which keeps web and worker as separate services — see `Dockerfile`.)

**Steps:**

1. **Aiven MySQL** — sign up at aiven.io (no card needed), create a free
   MySQL service, wait for it to go "Running", then copy its connection
   string from the service overview page (`mysql://avnadmin:...@....aivencloud.com:PORT/defaultdb?ssl-mode=REQUIRED`
   or similar — Aiven requires TLS).

2. **Push this branch** (or merge it to `main` first) to GitHub if it isn't
   already — Render deploys from a GitHub repo.

3. **Render dashboard → New → Blueprint**, point it at this repo/branch.
   Render reads `render.yaml` at the repo root and creates the service.
   `SECRET_KEY` is auto-generated by Render itself (`generateValue: true` —
   nothing here invents or stores it). You'll be prompted for the
   `sync: false` vars during setup; fill them in as:
   - `ALLOWED_HOSTS` → the `*.onrender.com` hostname Render assigns (visible
     once the service is created — you may need to save once, copy the
     hostname, then edit this var and save again).
   - `CORS_ALLOWED_ORIGINS` → wherever the web app runs (e.g.
     `http://localhost:3000` while it's still local-only).
   - `DATABASE_URL` → the Aiven connection string from step 1.
   - `OTP_TEST_PHONE_NUMBERS` → optional; leave blank to have every phone
     number's OTP echoed in the response (`OTP_RETURN_IN_RESPONSE=True` is
     already set by the blueprint, since there's no SMS provider wired up —
     see §5 above for the tradeoff).

4. **Migrations run automatically** on every boot via
   `scripts/render-start.sh` (`migrate` is idempotent, so this is safe on a
   single instance). **Seed data does not** — `seed_demo` *wipes and
   recreates* enquiry data every run (see its docstring), so it must stay a
   manual, one-off step, never part of the boot script. Run it from your own
   machine against the Aiven DB rather than depending on Render's Shell
   access (not available on every plan tier): temporarily set
   `DATABASE_URL` (and `DB_SSL_MODE=REQUIRED`) in your local `.env` to
   Aiven's connection string, run `python manage.py seed_demo`, then unset
   them again. This also creates the demo admin login (phone
   `9876543210`) — no separate `createsuperuser` step needed for the CRM's
   own phone+OTP login; that command is only for Django's unrelated
   `/admin/` site.

5. **Verify:** hit `https://<your-service>.onrender.com/api/dashboard/` —
   expect a 401 (no token) rather than a 500. Request an OTP for the admin
   phone number, confirm it's echoed in the response, log in, confirm
   `/api/dashboard/` now returns real data.
