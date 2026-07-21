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

from django.conf import settings

# The gateway transport now lives in crm/sms.py so OTP and lead-follow-up SMS
# share one implementation. SmsSendError is re-exported here so existing
# importers (crm/views.py's `from .otp_delivery import ... SmsSendError`) keep
# working unchanged.
from .sms import SmsSendError, deliver_sms

logger = logging.getLogger("crm.otp_delivery")

__all__ = ["SmsSendError", "get_otp_delivery_service"]


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


class ProviderOtpDeliveryService(OtpDeliveryService):
    """Real SMS via the shared gateway in crm/sms.py.

    `echo_in_response` is ALWAYS False here. Once a code can reach the phone
    there is no reason to also hand it back over the API, and that echo is
    precisely the account-takeover hole this integration exists to close.

    The message is built from a DLT-approved template. India's DLT regime
    matches the delivered text against the registered template, so
    SMS_OTP_TEMPLATE must stay byte-identical to what was approved under
    SMS_DLT_TEMPLATE_ID.
    """

    def send_otp(self, *, phone: str, code: str) -> dict:
        message = settings.SMS_OTP_TEMPLATE.format(code=code)
        # deliver_sms raises SmsSendError on any non-acceptance; request_otp
        # turns that into a 502 rather than a false "OTP sent".
        deliver_sms(
            phone=phone,
            message=message,
            dlt_template_id=settings.SMS_DLT_TEMPLATE_ID or None,
        )
        # Not logging the code once a real gateway carries it — it's on the
        # phone, and server logs are read by more people than the owner.
        return {"status": "sent", "channel": "sms", "echo_in_response": False}


def get_otp_delivery_service() -> OtpDeliveryService:
    if settings.OTP_PROVIDER:
        return ProviderOtpDeliveryService()
    return DevOtpDeliveryService()
