"""
Pluggable OTP delivery interface.

`get_otp_delivery_service()` is the one seam `request_otp` (crm/views.py)
depends on. No real SMS gateway is wired up yet, so today it always returns
`DevOtpDeliveryService` — but the call site never assumes that; it only
reads `send_otp()`'s return value to decide whether the code is safe to put
in the API response. Two implementations:

  - DevOtpDeliveryService (default, no OTP_PROVIDER set) — logs the code
    server-side always (so it's visible in whatever the host platform
    captures from stdout), and tells the caller it's safe to echo in the
    response only when settings.OTP_RETURN_IN_RESPONSE is on AND the phone
    is either unrestricted (OTP_TEST_PHONE_NUMBERS unset — local dev, every
    number echoes, today's convenience) or explicitly allow-listed
    (OTP_TEST_PHONE_NUMBERS set — a staging server with real users can hand
    out a handful of team test numbers without leaking anyone else's code).

  - ProviderOtpDeliveryService — stub. Selected once OTP_PROVIDER is set
    (e.g. "msg91", "twilio"). Raises until a real integration is written
    here, so a misconfigured OTP_PROVIDER fails loudly at send time instead
    of silently locking every user out.

To go live with a real SMS provider: implement `send_otp` in
ProviderOtpDeliveryService against MSG91/Twilio's HTTP API (add whatever
MSG91_*/TWILIO_* settings it needs alongside OTP_PROVIDER in settings.py),
set OTP_PROVIDER in the environment, and set OTP_RETURN_IN_RESPONSE=False.
No call site (crm/views.py's request_otp) needs to change either way.
"""
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings

logger = logging.getLogger("crm.otp_delivery")


class OtpDeliveryService:
    """Base interface — one method, one job: get the code to the phone (or
    log it, until a real gateway exists) and report back whether it's safe
    for the caller to also put it in the HTTP response."""

    def send_otp(self, *, phone: str, code: str) -> dict:
        raise NotImplementedError


class DevOtpDeliveryService(OtpDeliveryService):
    """No real SMS gateway configured. Always logs the code server-side;
    echoes it in the API response only for phones OTP_RETURN_IN_RESPONSE
    and OTP_TEST_PHONE_NUMBERS jointly allow — see module docstring."""

    def send_otp(self, *, phone: str, code: str) -> dict:
        logger.info("OTP [dev, no SMS gateway configured] phone=%s code=%s", phone, code)
        allowlist = settings.OTP_TEST_PHONE_NUMBERS
        allowed = not allowlist or phone in allowlist
        echo = bool(settings.OTP_RETURN_IN_RESPONSE and allowed)
        return {"status": "logged", "channel": "dev", "echo_in_response": echo}


class SmsSendError(Exception):
    """The gateway didn't accept the message. Raised so the caller can tell
    the user their code isn't coming, instead of showing "OTP sent" for an
    SMS that never left."""


class ProviderOtpDeliveryService(OtpDeliveryService):
    """Real SMS via bulksmsserviceproviders.com's send_http.php.

    `echo_in_response` is ALWAYS False here. Once a code can reach the phone
    there is no reason to also hand it back over the API, and that echo is
    precisely the account-takeover hole this integration exists to close.

    The message is built from a DLT-approved template. India's DLT regime
    matches the delivered text against the registered template — drift a word
    and the operator silently drops it, so SMS_OTP_TEMPLATE must stay
    byte-identical to what was approved under SMS_DLT_TEMPLATE_ID:

        Use the OTP {code} to verify your contact number. BGIVNS

    HTTPS by default, though the provider's own sample uses http://: the auth
    key is a bearer credential and has no business crossing the network in
    clear text.
    """

    #: Provider replies are plain text, not JSON. Anything that isn't an
    #: obvious failure marker is treated as accepted — we can't enumerate
    #: their whole vocabulary, so we look for what we know means "no".
    FAILURE_MARKERS = ("invalid", "error", "failure", "failed", "insufficient", "unauthor")

    def send_otp(self, *, phone: str, code: str) -> dict:
        if not settings.SMS_AUTH_KEY:
            raise SmsSendError(
                "OTP_PROVIDER is set but SMS_AUTH_KEY is empty — the gateway "
                "would reject every send. Set it in the environment."
            )

        message = settings.SMS_OTP_TEMPLATE.format(code=code)
        params = {
            "authkey": settings.SMS_AUTH_KEY,
            "sender": settings.SMS_SENDER,
            "mobiles": phone,
            "message": message,
            "route": settings.SMS_ROUTE,
        }
        # Only send the DLT id when configured — some accounts reject an
        # unexpected parameter outright.
        if settings.SMS_DLT_TEMPLATE_ID:
            params["DLT_TE_ID"] = settings.SMS_DLT_TEMPLATE_ID
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
            # Never let the provider's response text into the exception the
            # user sees, and never log the auth key.
            logger.error("OTP SMS transport failure for %s: %s", phone, exc)
            raise SmsSendError("Couldn't reach the SMS gateway.") from exc

        lowered = raw.lower()
        if any(m in lowered for m in self.FAILURE_MARKERS):
            logger.error("OTP SMS rejected for %s — gateway said: %s", phone, raw[:200])
            raise SmsSendError("The SMS gateway rejected the message.")

        # Deliberately NOT logging the code once a real gateway is carrying
        # it — it's on the phone, and server logs are read by more people
        # than the account owner.
        logger.info("OTP SMS accepted for %s — gateway said: %s", phone, raw[:120])
        return {"status": "sent", "channel": "sms", "echo_in_response": False, "raw": raw[:120]}


def get_otp_delivery_service() -> OtpDeliveryService:
    if settings.OTP_PROVIDER:
        return ProviderOtpDeliveryService()
    return DevOtpDeliveryService()
