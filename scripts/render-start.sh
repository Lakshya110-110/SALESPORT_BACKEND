#!/bin/sh
# Render (free tier) start command — runs the Django-Q2 worker and the ASGI
# web server in one container, since Render's free plan only gives one
# always-on process. Not used by the AWS path (see Dockerfile CMD), which
# runs web and worker as separate services/tasks.
set -e

python manage.py migrate --noinput
python manage.py install_schedules

# Background worker. Backgrounded (&), not exec'd — the foreground web
# process below needs to stay PID 1 so it receives Render's shutdown signal
# directly; qcluster exits with the container, which is fine for this
# single-instance deploy (no in-flight task draining needed).
python manage.py qcluster &

exec uvicorn salesport.asgi:application --host 0.0.0.0 --port ${PORT:-8000}
