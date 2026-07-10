# SalesPort CRM backend — production image.
#
# Why a Dockerfile over a Procfile: the stated deploy target is AWS, where a
# container is the standard deployable unit (ECS/Fargate, App Runner, or EC2
# via any container runtime) — a Procfile only means something to a handful
# of PaaS platforms (Heroku, Railway) that parse it themselves. A container
# image runs identically everywhere, including those same PaaS platforms
# (most accept "deploy this image" as well as a Procfile), so it's the more
# portable choice without losing anything.
#
# This same image runs BOTH processes SalesPort needs — which one depends on
# the command the deploy platform runs it with, not on anything baked into
# the image:
#   Web:    uvicorn salesport.asgi:application --host 0.0.0.0 --port $PORT
#   Worker: python manage.py qcluster
# See DEPLOY.md for exact commands, env vars, and release-step (migrate /
# collectstatic) instructions.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System libs mysqlclient needs to build + link against at install time.
RUN apt-get update && apt-get install -y --no-install-recommends \
        default-libmysqlclient-dev \
        build-essential \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Collected once at build time with whatever env vars are available (or none
# — SECRET_KEY/DATABASE fall back to safe dev defaults that collectstatic
# never actually touches). The real per-deploy collectstatic/migrate pass
# still happens as a release step against the real environment — see
# DEPLOY.md — this just means a fresh container already has static/
# populated even before that step runs.
RUN python manage.py collectstatic --noinput

# Runs as an unprivileged user — standard container hardening, not
# SalesPort-specific.
RUN useradd --create-home --shell /bin/bash appuser
USER appuser

EXPOSE 8000

# Shell form (not exec-array form) so $PORT actually expands — most
# container platforms (AWS App Runner, Render, Railway, Heroku-likes) inject
# PORT and expect the process to bind to it; falls back to 8000 if unset
# (e.g. plain `docker run` or ECS with a fixed container port mapping).
CMD uvicorn salesport.asgi:application --host 0.0.0.0 --port ${PORT:-8000}
