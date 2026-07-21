"""
Django settings for the Khwaishein Enterprise Lead Management CRM backend.
Powers the web admin console and the mobile field app.
Sort String Solutions LLP.
"""
from pathlib import Path
from datetime import timedelta
import os
import warnings

from django.core.exceptions import ImproperlyConfigured

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent


def env(key, default=None):
    return os.environ.get(key, default)


def env_bool(key, default):
    return env(key, "True" if default else "False").lower() == "true"


def env_list(key, default=""):
    return [v.strip() for v in env(key, default).split(",") if v.strip()]


SECRET_KEY = env("SECRET_KEY", "dev-insecure-change-me-in-production")
# Production must default closed: DEBUG leaks stack traces, SQL, and settings
# to anyone who can trigger a 500. Local dev sets DEBUG=True explicitly in
# its own .env (see .env.example) — this default only protects a deploy that
# forgot to set the var at all.
DEBUG = env_bool("DEBUG", False)
if SECRET_KEY == "dev-insecure-change-me-in-production" and not DEBUG:
    warnings.warn(
        "DEBUG=False but SECRET_KEY is still the insecure default — set a "
        "real SECRET_KEY in production.", RuntimeWarning,
    )

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "*")
if not DEBUG and ALLOWED_HOSTS == ["*"]:
    warnings.warn(
        "DEBUG=False but ALLOWED_HOSTS is still '*' — set it to the real "
        "production domain(s) (see .env.example).", RuntimeWarning,
    )

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "rest_framework",
    "corsheaders",
    "django_q",
    # local
    "crm",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    # GZip must come BEFORE CommonMiddleware so it can compress the response
    # after CommonMiddleware writes headers. Halves API JSON payloads.
    "django.middleware.gzip.GZipMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise must sit directly after SecurityMiddleware (its own
    # documented required position) so it can serve STATIC_ROOT itself —
    # collected admin/DRF-browsable-API assets — without needing nginx or S3
    # in front of the app just for CSS/JS. Media (user uploads) is separate,
    # governed by FILE_STORAGE below.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "salesport.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "salesport.wsgi.application"

# ---------------------------------------------------------------------------
# Database — MySQL (Khwaishein's current) with a SQLite fallback for quick demo.
#
# Three ways in, checked in this order:
#   1. DATABASE_URL — a single connection string. What most PaaS platforms
#      (Render, Railway, Heroku-likes) inject automatically; set it and
#      every DB_* var below is ignored.
#   2. DB_ENGINE=mysql (default) + the DB_* vars — Khwaishein's own AWS/RDS
#      setup, or any MySQL you point it at by hand.
#   3. DB_ENGINE=sqlite, or DB_NAME simply left unset — runs instantly with
#      no external database, for a quick local demo.
# ---------------------------------------------------------------------------
_database_url = env("DATABASE_URL", "")
DB_ENGINE = env("DB_ENGINE", "mysql").lower()

if _database_url:
    import dj_database_url
    DATABASES = {"default": dj_database_url.parse(_database_url, conn_max_age=600)}
elif DB_ENGINE == "sqlite" or not env("DB_NAME"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": env("DB_NAME", "salesport_crm"),
            "USER": env("DB_USER", "root"),
            "PASSWORD": env("DB_PASSWORD", ""),
            "HOST": env("DB_HOST", "127.0.0.1"),
            "PORT": env("DB_PORT", "3306"),
            "OPTIONS": {
                "charset": "utf8mb4",
                **({"sql_mode": env("DB_SQL_MODE")} if env("DB_SQL_MODE") else {}),
            },
        }
    }

# Managed MySQL providers (Aiven, PlanetScale, etc.) require TLS. Their
# connection strings often carry a `?ssl-mode=REQUIRED` query param, which
# dj_database_url passes straight into OPTIONS verbatim — but `ssl-mode`
# (hyphen) isn't a real MySQLdb.connect() keyword, so leaving it in place
# raises `TypeError: 'ssl-mode' is an invalid keyword argument` the moment
# Django opens a connection. Drop it and use the correctly-named `ssl_mode`
# (underscore) instead, driven by DB_SSL_MODE=REQUIRED (or VERIFY_CA/
# VERIFY_IDENTITY) — works whether DATABASES came from DATABASE_URL or the
# DB_* vars above, and means Aiven's connection string can be pasted in
# verbatim. Left unset, behavior is unchanged (plain connection, e.g. local
# MySQL).
if DATABASES["default"]["ENGINE"] == "django.db.backends.mysql":
    DATABASES["default"].get("OPTIONS", {}).pop("ssl-mode", None)
    _db_ssl_mode = env("DB_SSL_MODE", "")
    if _db_ssl_mode:
        DATABASES["default"].setdefault("OPTIONS", {})["ssl_mode"] = _db_ssl_mode

AUTH_USER_MODEL = "crm.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# collectstatic's target — WhiteNoise serves everything under here directly
# from the app process, so a deploy doesn't need nginx/S3 in front just to
# serve the Django admin's / DRF browsable API's CSS and JS.
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = (
    "whitenoise.storage.CompressedManifestStaticFilesStorage" if not DEBUG
    else "django.contrib.staticfiles.storage.StaticFilesStorage"
)
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Media (uploaded files) — swappable storage backend.
#
# Default: local FileSystemStorage under MEDIA_ROOT, served by Django in
# DEBUG. To switch to S3 later, `pip install django-storages boto3` and set
#
#   FILE_STORAGE=s3
#   AWS_STORAGE_BUCKET_NAME=…
#   AWS_S3_REGION_NAME=…
#   AWS_ACCESS_KEY_ID=…  (or use an instance role)
#   AWS_SECRET_ACCESS_KEY=…
#
# — nothing else in the codebase needs to change.
# ---------------------------------------------------------------------------
MEDIA_ROOT = BASE_DIR / env("MEDIA_ROOT_DIR", "media")
MEDIA_URL = env("MEDIA_URL", "/media/")

FILE_STORAGE = env("FILE_STORAGE", "filesystem").lower()
if FILE_STORAGE == "s3":
    # django-storages S3 backend — only picked up if the env explicitly asks
    # for it. Missing bucket is a hard error so we fail loudly at boot
    # instead of silently writing files to a random default location.
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", "")
    if not AWS_STORAGE_BUCKET_NAME:
        raise RuntimeError(
            "FILE_STORAGE=s3 requires AWS_STORAGE_BUCKET_NAME to be set."
        )
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", "ap-south-1")
    AWS_S3_ADDRESSING_STYLE = env("AWS_S3_ADDRESSING_STYLE", "virtual")
    AWS_S3_FILE_OVERWRITE = False
    AWS_DEFAULT_ACL = None
    # Presigned URLs by default so private buckets stay private; flip to False
    # for a public-read bucket where the URLs can be shared long-lived.
    AWS_QUERYSTRING_AUTH = env("AWS_QUERYSTRING_AUTH", "True").lower() == "true"
    AWS_QUERYSTRING_EXPIRE = int(env("AWS_QUERYSTRING_EXPIRE", "3600"))
    # Optional endpoint override — for MinIO / R2 / self-hosted S3-compat.
    _s3_endpoint = env("AWS_S3_ENDPOINT_URL", "")
    if _s3_endpoint:
        AWS_S3_ENDPOINT_URL = _s3_endpoint
    # Optional custom CDN / CloudFront domain — becomes the file URL prefix.
    # If set, also set AWS_QUERYSTRING_AUTH=False: presigned URLs are unique
    # and expiring, so every request is a cache miss at the CDN edge,
    # defeating the point of fronting it with CloudFront. Keep the bucket
    # itself private via a CloudFront Origin Access Control instead — the
    # CDN can still read it, the public internet can't reach S3 directly.
    _cdn = env("AWS_S3_CUSTOM_DOMAIN", "")
    if _cdn:
        AWS_S3_CUSTOM_DOMAIN = _cdn
    # Credentials — omit to let boto3 use the IAM role / instance profile /
    # ~/.aws/credentials chain. Setting only makes sense for CI / local dev.
    _ak = env("AWS_ACCESS_KEY_ID", "")
    _sk = env("AWS_SECRET_ACCESS_KEY", "")
    if _ak and _sk:
        AWS_ACCESS_KEY_ID = _ak
        AWS_SECRET_ACCESS_KEY = _sk
# else: Django's default FileSystemStorage (files under MEDIA_ROOT, served in DEBUG).

# ---------------------------------------------------------------------------
# Django REST Framework + JWT
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    # Honours ?page_size= (capped) — the stock class ignores it silently, which
    # had every list in the web app computing from its first 25 rows. See
    # crm/pagination.py.
    "DEFAULT_PAGINATION_CLASS": "crm.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    # The HTML browsable API is a dev convenience (click-through forms in a
    # browser) that also happens to render an explorable map of every
    # endpoint — fine locally, unnecessary surface area on a public server.
    # JSON-only in production; both renderers still available in DEBUG.
    "DEFAULT_RENDERER_CLASSES": (
        ("rest_framework.renderers.JSONRenderer",) if not DEBUG else
        ("rest_framework.renderers.JSONRenderer", "rest_framework.renderers.BrowsableAPIRenderer")
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# ---------------------------------------------------------------------------
# Cache — Redis (Memurai locally; ElastiCache/managed Redis in prod). Falls
# back to Django's in-process LocMemCache if CACHE_BACKEND is set to anything
# else, so a fresh clone without Redis/Memurai installed still runs.
# ---------------------------------------------------------------------------
REDIS_URL = env("REDIS_URL", "redis://127.0.0.1:6379/1")
USE_REDIS = env("CACHE_BACKEND", "redis").lower() == "redis"

if USE_REDIS:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
        }
    }
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# ---------------------------------------------------------------------------
# OTP delivery — see crm/otp_delivery.py for the swappable send_otp
# interface. No real SMS gateway is wired up yet, so:
#   - OTP_RETURN_IN_RESPONSE defaults to True in local dev (DEBUG=True, so
#     you can log in without an SMS provider) and False everywhere else —
#     a production deploy that forgets to set it never echoes a code.
#   - OTP_TEST_PHONE_NUMBERS, if set, restricts echoing to just those
#     numbers even when OTP_RETURN_IN_RESPONSE=True — lets a staging server
#     with real users log in via a handful of team test numbers without
#     leaking anyone else's OTP. Leave unset for local dev (every number
#     echoes, today's convenience, unchanged).
#   - OTP_PROVIDER selects a real gateway (e.g. "msg91", "twilio") once one
#     is actually implemented in crm/otp_delivery.py — TODO, not built yet.
# ---------------------------------------------------------------------------
OTP_TTL_SECONDS = int(env("OTP_TTL_SECONDS", "300"))

# --- Feature flags ---------------------------------------------------------
# Proposals are hidden pending a rework. Off, /api/proposals/ returns 404 and
# the `proposals` array on an enquiry comes back empty.
#
# HIDDEN, NOT DELETED: the model, the migrations and the 36 existing rows —
# including uploaded PDFs — are untouched. Flipping this back on (or setting
# PROPOSALS_ENABLED=True in the environment) restores the endpoint and the
# data with it. The web console has a matching flag in web/src/lib/features.ts;
# both must agree.
PROPOSALS_ENABLED = env_bool("PROPOSALS_ENABLED", False)
OTP_RETURN_IN_RESPONSE = env_bool("OTP_RETURN_IN_RESPONSE", DEBUG)
OTP_TEST_PHONE_NUMBERS = env_list("OTP_TEST_PHONE_NUMBERS")
OTP_PROVIDER = env("OTP_PROVIDER", "")

# --- SMS gateway (bulksmsserviceproviders.com) ------------------------------
# Active only when OTP_PROVIDER is set; otherwise DevOtpDeliveryService runs
# and none of this is read.
#
# SMS_AUTH_KEY has NO DEFAULT on purpose. It is a bearer credential: anyone
# holding it can send SMS billed to this account. It belongs in the server's
# environment and must never be committed. ProviderOtpDeliveryService refuses
# to send when it's empty rather than firing a request the gateway would
# reject anyway.
SMS_AUTH_KEY = env("SMS_AUTH_KEY", "")
SMS_SENDER = env("SMS_SENDER", "BGIVNS")
# 'B' is what the provider's own working sample uses. Their docs also mention
# TR (transactional) / PR (promotional) for a different endpoint — if delivery
# fails, this is the first thing to question.
SMS_ROUTE = env("SMS_ROUTE", "B")
# HTTPS by default even though the provider's sample says http://: the auth
# key travels in this request. Verified their host answers on TLS.
SMS_API_URL = env("SMS_API_URL", "https://sms.bulksmsserviceproviders.com/api/send_http.php")
SMS_DLT_TEMPLATE_ID = env("SMS_DLT_TEMPLATE_ID", "1507163550834828118")
# MUST match the DLT-approved template for SMS_DLT_TEMPLATE_ID word for word.
# India's DLT regime compares the delivered text to the registered template;
# any drift and the operator drops the message silently — the user just never
# gets a code. `{code}` is the only substitution.
SMS_OTP_TEMPLATE = env(
    "SMS_OTP_TEMPLATE",
    "Use the OTP {code} to verify your contact number. BGIVNS",
)
# The approved template is plain English. unicode=1 switches the gateway to a
# 2-byte encoding, which shortens the segment limit and can break the DLT
# match — leave off unless the template itself is non-Latin.
SMS_UNICODE = env_bool("SMS_UNICODE", False)
SMS_TIMEOUT_SECONDS = int(env("SMS_TIMEOUT_SECONDS", "10"))

# Refuse to boot in the one configuration that hands out login codes to the
# internet: not DEBUG (so this is a real deployment), echoing the OTP in the
# response, and no allowlist restricting WHOSE code gets echoed.
#
# In that state `POST /api/auth/request-otp/` returns the live code for ANY
# registered phone, to any anonymous caller — knowing a colleague's number is
# enough to sign in as them. It is not a theoretical hole: it was reachable on
# the public deployment, and reading one code out of the JSON is how this was
# confirmed.
#
# Fails loudly at startup rather than quietly serving. The escape hatch is
# deliberate and narrow — set OTP_TEST_PHONE_NUMBERS to the handful of numbers
# that may receive an echoed code while no SMS gateway exists. Once
# OTP_PROVIDER is wired up, drop OTP_RETURN_IN_RESPONSE entirely.
# `not OTP_PROVIDER` matters: with a real gateway configured,
# ProviderOtpDeliveryService returns echo_in_response=False unconditionally, so
# OTP_RETURN_IN_RESPONSE can't leak anything no matter what it's set to. Without
# this clause the guard blocks the SECURE config — a deploy that has done the
# right thing (wired up SMS) but left a stale OTP_RETURN_IN_RESPONSE=True in its
# .env would refuse to boot for no reason. A guard that cries wolf on the good
# config gets switched off, and then it isn't there for the bad one.
if not DEBUG and not OTP_PROVIDER and OTP_RETURN_IN_RESPONSE and not OTP_TEST_PHONE_NUMBERS:
    raise ImproperlyConfigured(
        "OTP_RETURN_IN_RESPONSE=True with DEBUG=False and no "
        "OTP_TEST_PHONE_NUMBERS: the API would return a valid login code for "
        "ANY registered phone number to ANY caller. Either set "
        "OTP_TEST_PHONE_NUMBERS to the specific numbers allowed to receive an "
        "echoed code, or set OTP_RETURN_IN_RESPONSE=False (note: with no SMS "
        "provider configured, that means nobody can log in)."
    )

# ---------------------------------------------------------------------------
# CORS — wildcard is a local-dev convenience only. In production
# (DEBUG=False) CORS_ALLOW_ALL_ORIGINS is forced off regardless of the env
# var; only the explicit origins in CORS_ALLOWED_ORIGINS (the deployed web
# app's URL — e.g. Vercel) are allowed. An empty allow-list in production
# means no browser can call this API at all, so that misconfiguration is
# flagged loudly below rather than failing silently per-request.
# ---------------------------------------------------------------------------
CORS_ALLOW_ALL_ORIGINS = DEBUG and env_bool("CORS_ALLOW_ALL_ORIGINS", True)
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
if not DEBUG and not CORS_ALLOW_ALL_ORIGINS and not CORS_ALLOWED_ORIGINS:
    warnings.warn(
        "DEBUG=False but CORS_ALLOWED_ORIGINS is empty — no browser-based "
        "client (the web app) will be able to call this API. Set it to "
        "your deployed web app's origin(s), e.g. https://your-app.vercel.app",
        RuntimeWarning,
    )

# ---------------------------------------------------------------------------
# Security hardening — all gated on DEBUG so local dev (plain HTTP,
# localhost) is never affected. In production these assume the app runs
# behind a TLS-terminating reverse proxy / load balancer (ALB, Render,
# Railway, etc.) that forwards X-Forwarded-Proto, which
# SECURE_PROXY_SSL_HEADER tells Django to trust for its own HTTPS checks —
# without it, SECURE_SSL_REDIRECT and the *_COOKIE_SECURE flags below would
# see every request as plain HTTP (the proxy-to-app hop) and either loop on
# redirects or refuse to set cookies at all.
# ---------------------------------------------------------------------------
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    # 1 year, ramp down via env if HSTS ever needs to be backed out.
    SECURE_HSTS_SECONDS = int(env("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", True)
    SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", True)
else:
    SECURE_SSL_REDIRECT = False
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    SECURE_HSTS_SECONDS = 0

# Same in both environments — the app is never meant to be framed.
X_FRAME_OPTIONS = "DENY"

# ---------------------------------------------------------------------------
# Outbound notifications — stubbed, unused for now. crm/notifications.py's
# NotificationService is a no-op (logs + marks "queued") until a real
# implementation reads these and get_notification_service() is pointed at
# it. Left blank/empty is the expected state pre-launch.
# ---------------------------------------------------------------------------
WHATSAPP_PROVIDER = env("WHATSAPP_PROVIDER", "")
WHATSAPP_API_KEY = env("WHATSAPP_API_KEY", "")
WHATSAPP_TEMPLATE = env("WHATSAPP_TEMPLATE", "")
EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_FROM = env("EMAIL_FROM", "")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_USE_TLS = env("EMAIL_USE_TLS", "1") == "1"
# SMTP when a host is configured; otherwise a no-op console backend so a dev
# box logs the message instead of erroring on a missing mail server.
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend" if EMAIL_HOST
    else "django.core.mail.backends.console.EmailBackend"
)
DEFAULT_FROM_EMAIL = EMAIL_FROM or EMAIL_HOST_USER or "no-reply@sortstring.com"

# ---------------------------------------------------------------------------
# Django-Q2 task runner (Phase 7 Follow-ups + Phase 10 Notification fan-out).
#
# get_broker() in django_q/brokers/__init__.py checks in order: BROKER_CLASS,
# IRON_MQ, SQS, ORM, MONGO — and only falls through to Redis if NONE of those
# keys are set. So switching brokers isn't "add a redis key", it's "remove
# the orm key" — `django_redis: "default"` below reuses the same Redis
# connection as CACHES so there's only one Redis config to keep in sync.
# ---------------------------------------------------------------------------
Q_CLUSTER = {
    "name": "salesport-crm",
    "workers": 2,
    "recycle": 500,
    "timeout": 60,
    "retry": 90,
    "queue_limit": 50,
    "bulk": 10,
    **({"django_redis": "default"} if USE_REDIS else {"orm": "default"}),
    "sync": env("Q_SYNC", "False").lower() == "true",
    "catch_up": False,
}

# ---------------------------------------------------------------------------
# Logging — everything to stdout/stderr via Django's own default formatters.
# Every cloud host (ECS, Render, Railway, ...) captures container stdout as
# the log stream, so this is the whole story for "logs are visible in
# production" — no file paths, no log-shipping config to maintain here.
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {
        "handlers": ["console"],
        "level": env("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django.server": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}
