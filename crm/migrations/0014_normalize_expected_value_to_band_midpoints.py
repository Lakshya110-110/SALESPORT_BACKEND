from django.db import migrations


# Mirrors VALUE_BANDS in crm/views.py and web/src/lib/utils/valueBand.ts, plus the
# midpoint each band stores. Duplicated here on purpose: a migration must keep
# working against the data as it was when the migration ran, so it must not
# import a table that later edits could move under it.
#
# (min_inclusive, max_exclusive, midpoint)
BANDS = [
    (0, 100000, 50000),
    (100000, 400000, 250000),
    (400000, 700000, 550000),
    (700000, 1100000, 900000),
    (1100000, 1600000, 1350000),
    (1600000, 2600000, 2100000),
    (2600000, 5000000, 3800000),
    (5000000, None, 5000000),
]


def midpoint_for(value):
    """The stored figure for whichever band `value` falls in, or None if it has none."""
    if value is None or value <= 0:
        return None
    for lo, hi, mid in BANDS:
        if value >= lo and (hi is None or value < hi):
            return mid
    return None


def to_midpoints(apps, schema_editor):
    """
    Deal value is now picked from a band dropdown rather than typed, so every
    stored figure becomes its band's midpoint — otherwise old exact amounts and
    new banded ones would be two different kinds of number in one column.

    THIS IS LOSSY AND DELIBERATE. The exact figures are not recoverable from the
    database afterwards; they were exported first to
    salesport_expected_value_backup_2026-07-16.csv (see reverse()).

    Enquiries with no figure (0) are left at 0 — "nothing entered" is not a band
    and must not become "under ₹1 L".
    """
    Enquiry = apps.get_model("crm", "Enquiry")
    for enq in Enquiry.objects.exclude(expected_value=0).iterator():
        mid = midpoint_for(enq.expected_value)
        if mid is not None and enq.expected_value != mid:
            enq.expected_value = mid
            enq.save(update_fields=["expected_value"])


def reverse(apps, schema_editor):
    """
    Not reversible: the original amounts are gone once forward() has run, and a
    midpoint cannot tell you which exact figure produced it. Restore from
    salesport_expected_value_backup_2026-07-16.csv (id -> expected_value_ORIGINAL)
    if the exact numbers are needed again.

    A no-op rather than raising, so unrelated rollbacks past this point aren't
    blocked — but understand that rolling back does NOT bring the figures back.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0013_remap_enquiry_statuses"),
    ]

    operations = [
        migrations.RunPython(to_midpoints, reverse),
    ]
