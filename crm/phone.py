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


# An Indian mobile number is 10 digits starting 6, 7, 8 or 9. The 0-5 range is
# not issued to mobiles: 0 is the trunk prefix and 1-5 belong to landline and
# service codes, so a "number" starting there is a typo or junk.
INDIAN_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")


def is_valid_indian_mobile(raw: str) -> bool:
    """True when `raw` is a real Indian mobile number.

    Accepts "9876543210", "09876543210", "919876543210", "+91 98765 43210".

    Deliberately does NOT go through normalize_phone(). That keeps the LAST 10
    digits of anything longer, which is right for stripping a country code but
    wrong for validation: it turns the 11-digit typo "98765432101" into
    "8765432101" — a different, perfectly valid number — so a slipped finger
    would be accepted and silently save someone else's phone. Here we strip
    only an explicit trunk "0" or country code "91", and anything else of the
    wrong length is rejected rather than trimmed into something plausible.
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return bool(INDIAN_MOBILE_RE.match(digits))


# Kept identical in web/src/lib/utils/phone.ts — edit both together.
PHONE_ERROR = "Enter a valid 10-digit Indian mobile number — it must start with 6, 7, 8 or 9."
