"""
The single place the app talks to the SMS gateway.

Extracted from otp_delivery.py so OTP and lead-follow-up SMS share ONE gateway
implementation — two copies of the send logic would drift, and a fix to one
(a header, a failure marker) would silently miss the other.

`deliver_sms()` is the raw transport: build the request, POST it, decide from
the plain-text reply whether it was accepted. It knows nothing about OTPs or
templates — callers hand it finished text plus the DLT id that text was
registered under.

`sms_live()` is the master switch. When the gateway isn't configured (no
OTP_PROVIDER, or no SMS_AUTH_KEY) nothing is sent — the caller logs and carries
on. That's what lets the whole follow-up flow be exercised end to end on a dev
box without a rupee spent or a real handset touched, exactly as OTP already is.
"""
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings

logger = logging.getLogger("crm.sms")


class SmsSendError(Exception):
    """The gateway didn't accept the message. Raised so a caller can tell the
    user it didn't go, instead of reporting success for an SMS that never left."""


#: Provider replies are plain text, not JSON. We can't enumerate their whole
#: vocabulary, so anything that isn't an obvious failure marker is treated as
#: accepted. Shared with OTP so both judge a send the same way.
FAILURE_MARKERS = ("invalid", "error", "failure", "failed", "insufficient", "unauthor")


def sms_live() -> bool:
    """True only when the gateway is actually wired: a provider is selected AND
    an auth key exists. Everywhere else we're in dev mode — log, don't send."""
    return bool(settings.OTP_PROVIDER and settings.SMS_AUTH_KEY)


def deliver_sms(*, phone: str, message: str, dlt_template_id: str | None = None) -> dict:
    """POST one message to the gateway. Raises SmsSendError if it isn't accepted.

    `message` must already be the final text, and — under India's DLT regime —
    byte-identical to the template registered under `dlt_template_id`, or the
    operator drops it. Rendering and template-matching are the caller's job;
    this only carries what it's given.
    """
    if not settings.SMS_AUTH_KEY:
        raise SmsSendError(
            "SMS gateway not configured (SMS_AUTH_KEY empty) — the gateway "
            "would reject every send."
        )

    params = {
        "authkey": settings.SMS_AUTH_KEY,
        "sender": settings.SMS_SENDER,
        "mobiles": phone,
        "message": message,
        "route": settings.SMS_ROUTE,
    }
    # Only attach the DLT id when there is one — some accounts reject an
    # unexpected parameter outright.
    if dlt_template_id:
        params["DLT_TE_ID"] = dlt_template_id
    if settings.SMS_UNICODE:
        params["unicode"] = "1"

    body = urlencode(params).encode()
    req = Request(
        settings.SMS_API_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urlopen(req, timeout=settings.SMS_TIMEOUT_SECONDS) as resp:
            raw = resp.read().decode("utf-8", "replace").strip()
    except (URLError, HTTPError, TimeoutError, OSError) as exc:
        # Never leak the provider's response text or the auth key.
        logger.error("SMS transport failure for %s: %s", phone, exc)
        raise SmsSendError("Couldn't reach the SMS gateway.") from exc

    lowered = raw.lower()
    if any(m in lowered for m in FAILURE_MARKERS):
        logger.error("SMS rejected for %s — gateway said: %s", phone, raw[:200])
        raise SmsSendError("The SMS gateway rejected the message.")

    logger.info("SMS accepted for %s — gateway said: %s", phone, raw[:120])
    return {"status": "sent", "raw": raw[:120]}
