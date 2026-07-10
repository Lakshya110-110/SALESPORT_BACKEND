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


class ProviderOtpDeliveryService(OtpDeliveryService):
    """Real SMS gateway — TODO: not implemented yet. Wire this up against
    MSG91/Twilio (or whichever provider) once credentials exist; until then
    it raises so OTP_PROVIDER being set without a real implementation is
    loud, not a silent login outage."""

    def send_otp(self, *, phone: str, code: str) -> dict:
        raise NotImplementedError(
            f"OTP_PROVIDER={settings.OTP_PROVIDER!r} is set but no real SMS "
            "integration is implemented yet. Implement "
            "ProviderOtpDeliveryService.send_otp in crm/otp_delivery.py "
            "against the provider's API, or unset OTP_PROVIDER to fall back "
            "to DevOtpDeliveryService."
        )


def get_otp_delivery_service() -> OtpDeliveryService:
    if settings.OTP_PROVIDER:
        return ProviderOtpDeliveryService()
    return DevOtpDeliveryService()
