"""
Django settings for the SalesPort Enterprise Lead Management CRM backend.
Powers the web admin console and the mobile field app.
Sort String Solutions LLP.
"""
from pathlib import Path
from datetime import timedelta
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent


def env(key, default=None):
    return os.environ.get(key, default)


SECRET_KEY = env("SECRET_KEY", "dev-insecure-change-me-in-production")
DEBUG = env("DEBUG", "True").lower() == "true"
ALLOWED_HOSTS = env("ALLOWED_HOSTS", "*").split(",")

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
# Database — MySQL (SalesPort's current) with a SQLite fallback for quick demo.
# Set DB_ENGINE=mysql (default) and the DB_* vars, OR DB_ENGINE=sqlite to run
# instantly with no external database.
# ---------------------------------------------------------------------------
DB_ENGINE = env("DB_ENGINE", "mysql").lower()

if DB_ENGINE == "sqlite" or not env("DB_NAME"):
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
            "OPTIONS": {"charset": "utf8mb4"},
        }
    }

AUTH_USER_MODEL = "crm.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
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
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
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

# OTP settings (demo-friendly)
OTP_TTL_SECONDS = int(env("OTP_TTL_SECONDS", "300"))
OTP_RETURN_IN_RESPONSE = env("OTP_RETURN_IN_RESPONSE", "True").lower() == "true"

# CORS — allow the web + mobile clients during development
CORS_ALLOW_ALL_ORIGINS = env("CORS_ALLOW_ALL_ORIGINS", "True").lower() == "true"
CORS_ALLOWED_ORIGINS = [o for o in env("CORS_ALLOWED_ORIGINS", "").split(",") if o]

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
