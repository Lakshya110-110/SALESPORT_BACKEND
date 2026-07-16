from django.db import migrations


# The band table as re-specified: three-lakh segments SHARING their boundary
# (1-3, 3-6, 6-9 … 48-50), then an open 50 L+. No band below ₹1 L.
# Mirrors VALUE_BANDS in crm/views.py and web/src/lib/utils/valueBand.ts.
# Duplicated here on purpose: a migration must not import a live table that
# later edits could move under it.
#
# (min_inclusive, max_exclusive, midpoint)
BANDS = [
    (100000, 300000, 200000),
    (300000, 600000, 450000),
    (600000, 900000, 750000),
    (900000, 1200000, 1050000),
    (1200000, 1500000, 1350000),
    (1500000, 1800000, 1650000),
    (1800000, 2100000, 1950000),
    (2100000, 2400000, 2250000),
    (2400000, 2700000, 2550000),
    (2700000, 3000000, 2850000),
    (3000000, 3300000, 3150000),
    (3300000, 3600000, 3450000),
    (3600000, 3900000, 3750000),
    (3900000, 4200000, 4050000),
    (4200000, 4500000, 4350000),
    (4500000, 4800000, 4650000),
    (4800000, 5000000, 4900000),
    (5000000, None, 5000000),
]


def midpoint_for(value):
    if value is None or value <= 0:
        return None
    for lo, hi, mid in BANDS:
        if value >= lo and (hi is None or value < hi):
            return mid
    return None


def reband(apps, schema_editor):
    """
    Re-band every stored figure onto the three-lakh table.

    NOTE ON A FRESH DATABASE: 0014 banded onto an earlier, coarser table and
    stored ITS midpoints, so running 0014 then this migration re-bands a
    midpoint rather than the original figure — e.g. a real ₹8,00,000 became
    900000 under 0014, which lands in "9-12" here although ₹8 L belongs in
    "6-9". On the machine this was authored on, the pre-0014 figures were
    restored from salesport_expected_value_backup_2026-07-16.csv BEFORE this
    ran, so the banding here was computed from the true originals.

    Anywhere else, treat the result as approximate and re-import from that CSV
    if the exact figures matter. (There is no other deployment today.)

    Values of 0 stay 0 — "nothing entered" is not a deal size. Anything above 0
    but under ₹1 L is left alone: there is no band for it, by design.
    """
    Enquiry = apps.get_model("crm", "Enquiry")
    for enq in Enquiry.objects.exclude(expected_value=0).iterator():
        mid = midpoint_for(enq.expected_value)
        if mid is not None and enq.expected_value != mid:
            enq.expected_value = mid
            enq.save(update_fields=["expected_value"])


def reverse(apps, schema_editor):
    """
    Not reversible: a midpoint cannot tell you which figure produced it.
    Restore from salesport_expected_value_backup_2026-07-16.csv
    (id -> expected_value_ORIGINAL). A no-op rather than raising, so unrelated
    rollbacks past this point aren't blocked — but rolling back does NOT bring
    the figures back.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0014_normalize_expected_value_to_band_midpoints"),
    ]

    operations = [
        migrations.RunPython(reband, reverse),
    ]
