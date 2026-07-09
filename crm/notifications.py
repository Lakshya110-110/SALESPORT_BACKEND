"""
Pluggable outbound-notification interface (email / WhatsApp).

`get_notification_service()` is the one seam every caller depends on. Today
it always returns `NoOpNotificationService`, which logs what would have been
sent and reports it back as "queued" — it never claims a message was
delivered when it wasn't.

To go live with a real provider: implement `NotificationService` against
WhatsApp Business API / SMTP (reading the WHATSAPP_*/EMAIL_* settings that
are already stubbed in settings.py), then swap the return value of
get_notification_service() for it. No call site (crm/views.py's
MeetingViewSet) needs to change.
"""
import logging

logger = logging.getLogger("crm.notifications")


class NotificationService:
    """Base interface — one method per outbound channel a meeting can trigger."""

    def send_email(self, *, to_label: str, subject: str, body: str) -> dict:
        raise NotImplementedError

    def send_whatsapp(self, *, to_label: str, body: str) -> dict:
        raise NotImplementedError


class NoOpNotificationService(NotificationService):
    """Default until real provider credentials are supplied. Logs the
    composed message and reports "queued" — deliberately never "sent"."""

    def send_email(self, *, to_label: str, subject: str, body: str) -> dict:
        logger.info("EMAIL [queued, no-op] to=%s subject=%r body=%r", to_label, subject, body)
        return {"status": "queued", "channel": "email"}

    def send_whatsapp(self, *, to_label: str, body: str) -> dict:
        logger.info("WHATSAPP [queued, no-op] to=%s body=%r", to_label, body)
        return {"status": "queued", "channel": "whatsapp"}


def get_notification_service() -> NotificationService:
    # TODO(real providers): once WHATSAPP_PROVIDER / EMAIL_HOST etc. (see
    # settings.py) are actually configured in the environment, branch here
    # to return a real WhatsAppBusinessNotificationService /
    # SmtpNotificationService instead of the no-op below.
    return NoOpNotificationService()
