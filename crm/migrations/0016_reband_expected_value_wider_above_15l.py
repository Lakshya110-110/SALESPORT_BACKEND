from django.db import migrations


# Three-lakh steps to ₹15 L, then widening (15-20, 20-30, 30-50), then open.
# Mirrors VALUE_BANDS in crm/views.py and web/src/lib/utils/valueBand.ts.
# Duplicated on purpose: a migration must not import a live table that later
# edits could move under it.
#
# (min_inclusive, max_exclusive, midpoint)
BANDS = [
    (100000, 300000, 200000),
    (300000, 600000, 450000),
    (600000, 900000, 750000),
    (900000, 1200000, 1050000),
    (1200000, 1500000, 1350000),
    (1500000, 2000000, 1750000),
    (2000000, 3000000, 2500000),
    (3000000, 5000000, 4000000),
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
    Re-band onto the reduced table (18 bands -> 9, wider above ₹15 L).

    Like 0015, this must run against the ORIGINAL figures, not the previous
    migration's midpoints. The new bands are ALMOST a union of the old ones —
    but ₹20 L is a new boundary that the 18-band table did not have, so it
    splits the old "18-21" band. A real ₹20.5 L became midpoint ₹19.5 L under
    0015, which re-bands to "15-20" here, though ₹20.5 L belongs in "20-30".

    On the machine this was authored on, the pre-banding figures were restored
    from salesport_expected_value_backup_2026-07-16.csv BEFORE this ran, so the
    banding was computed from the true values. (No record currently falls in
    that gap, but the logic is wrong regardless of today's data.)

    Anywhere else, treat the result as approximate and re-import from that CSV
    if the exact figures matter. There is no other deployment today.

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
    Not reversible: a midpoint cannot tell you which figure produced it, and the
    old bands were narrower. Restore from
    salesport_expected_value_backup_2026-07-16.csv (id -> expected_value_ORIGINAL)
    if the exact figures are needed. A no-op rather than raising, so unrelated
    rollbacks past this point aren't blocked.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0015_reband_expected_value_to_three_lakh_steps"),
    ]

    operations = [
        migrations.RunPython(reband, reverse),
    ]
