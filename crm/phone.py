"""Canonical phone-number handling shared by the web and mobile logins.

The web console sends bare national digits ("9876543210"); a phone-auth
mobile app typically sends E.164 ("+919876543210"). Without one canonical
form the two clients resolve to DIFFERENT User rows for the same person
(OTP is issued/looked-up and the User is get_or_create'd by this exact
string — see crm/views.py request_otp / verify_otp). Normalizing here, and
again in User.save() / OTP.issue(), guarantees every path keys off the same
value regardless of which client sent the number.
"""
import re


def normalize_phone(raw: str) -> str:
    """Reduce any accepted phone format to bare 10-digit national form.

    Strips separators/formatting and a leading country code or trunk digit,
    then keeps the last 10 digits — India-focused, matching the numbers
    already stored. Returns "" for empty input and leaves anything shorter
    than 10 digits untouched so validation elsewhere can still reject it.
    """
    if not raw:
        return ""
    digits = re.sub(r"\D", "", raw)
    if len(digits) > 10:
        # Drops "+91"/"91"/leading "0" (and any other country code) so
        # "+919876543210", "919876543210", "09876543210" and "9876543210"
        # all collapse to the same key.
        digits = digits[-10:]
    return digits
