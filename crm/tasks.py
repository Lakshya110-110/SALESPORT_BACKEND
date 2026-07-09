"""
Background jobs for the CRM (Phase 7+).

Registered as Django-Q2 Schedules — see the `install_schedules` management
command for the wiring. Every function here is idempotent so a repeat run
inside the retry window doesn't spam notifications.
"""
from django.utils import timezone

from .models import FollowUp, Notification


def notify_overdue_followups():
    """Fire a `overdue` notification for every Pending follow-up whose
    `due_at` has passed and that hasn't already been notified today.

    Idempotency: we look for an existing notification with the same
    `link_id` created after midnight and skip duplicates.
    """
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    overdue = FollowUp.objects.filter(status="Pending", due_at__lt=now)
    created = 0
    for f in overdue.select_related("enquiry", "enquiry__company", "owner"):
        already = Notification.objects.filter(
            ntype="overdue",
            link_type="followup",
            link_id=str(f.id),
            created_at__gte=today_start,
        ).exists()
        if already:
            continue
        Notification.objects.create(
            recipient=f.owner,
            audience="consultant" if f.owner else "all",
            ntype="overdue",
            title=f"Overdue: {f.title}",
            subtitle=f"{f.enquiry.company.name} · due {f.due_at:%d %b %H:%M}",
            link_type="followup",
            link_id=str(f.id),
        )
        created += 1
    return f"Overdue follow-ups notified: {created}"
