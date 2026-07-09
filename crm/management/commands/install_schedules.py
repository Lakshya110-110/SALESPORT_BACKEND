"""
Register (or refresh) the Django-Q2 schedules the CRM depends on.

Idempotent — safe to run in production deploys as a post-migrate hook.
Run:  python manage.py install_schedules
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from django_q.models import Schedule


SCHEDULES = [
    {
        "name": "notify-overdue-followups",
        "func": "crm.tasks.notify_overdue_followups",
        "schedule_type": Schedule.HOURLY,
        "repeats": -1,
    },
]


class Command(BaseCommand):
    help = "Install / refresh the CRM's Django-Q2 background schedules."

    def handle(self, *args, **options):
        for cfg in SCHEDULES:
            sched, created = Schedule.objects.update_or_create(
                name=cfg["name"],
                defaults={
                    "func": cfg["func"],
                    "schedule_type": cfg["schedule_type"],
                    "repeats": cfg.get("repeats", -1),
                    "next_run": timezone.now() + timezone.timedelta(minutes=1),
                },
            )
            verb = "Created" if created else "Refreshed"
            self.stdout.write(f"{verb}: {sched.name} ({sched.func}, {sched.schedule_type})")
