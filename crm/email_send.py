"""
Outbound email for lead follow-ups.

Thin wrapper over Django's own mail: `send_email()` builds and sends one message
and raises EmailSendError if the SMTP layer refuses it, so a caller can report
the failure instead of logging a message that never left — the same contract
crm/sms.py's deliver_sms has.

`email_live()` mirrors sms_live(): a host configured means real SMTP; otherwise
Django is on the console backend and nothing leaves the box, which lets the whole
compose→send→log flow be exercised in dev with no mail server.

Unlike SMS there is no DLT constraint — email bodies are free text, so the
composer can be a plain subject + message rather than a template picker.
"""
import logging

from django.conf import settings
from django.core.mail import EmailMessage

logger = logging.getLogger("crm.email")


class EmailSendError(Exception):
    """SMTP didn't accept the message."""


def email_live() -> bool:
    """True only when a real SMTP host is configured. Otherwise Django is on the
    console backend and send() is a no-op — dev mode."""
    return bool(settings.EMAIL_HOST)


def send_email(*, to: str, subject: str, body: str) -> None:
    """Send one plain-text email. Raises EmailSendError on any failure.

    On a dev box (no EMAIL_HOST) Django's console backend swallows this without
    touching a network, so it's safe to call unconditionally — the caller keys
    off email_live() to decide what to tell the user.
    """
    msg = EmailMessage(
        subject=subject,
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to],
    )
    try:
        # fail_silently=False so a bad send surfaces as an exception rather than
        # a quiet no-op that looks like success.
        msg.send(fail_silently=False)
    except Exception as exc:  # smtplib raises a family of errors; treat all as send failure
        logger.error("Email send failure to %s: %s", to, exc)
        raise EmailSendError("Couldn't send the email.") from exc
