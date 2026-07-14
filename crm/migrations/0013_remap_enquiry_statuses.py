# Data migration: collapse the old 8-stage enquiry status set to the new 5
# (New, In Progress, Won, Lost, Spam) and refresh the Master Data "status" rows.
from django.db import migrations

# old status -> new status
STATUS_MAP = {
    "Enquiry": "New",
    "Qualified": "In Progress",
    "Meeting Scheduled": "In Progress",
    "Meeting Done": "In Progress",
    "Proposal Sent": "In Progress",
    "Negotiation": "In Progress",
    "Won": "Won",
    "Lost": "Lost",
}

NEW_STATUSES = [
    ("New", "New", 1),
    ("In Progress", "In Progress", 2),
    ("Won", "Won", 3),
    ("Lost", "Lost", 4),
    ("Spam", "Spam", 5),
]


def forwards(apps, schema_editor):
    Enquiry = apps.get_model("crm", "Enquiry")
    for old, new in STATUS_MAP.items():
        if old != new:
            Enquiry.objects.filter(status=old).update(status=new)

    # Rebuild the master-data "status" filter options to the new set.
    MasterData = apps.get_model("crm", "MasterData")
    MasterData.objects.filter(category="status").delete()
    for value, label, order in NEW_STATUSES:
        MasterData.objects.create(
            category="status", value=value, label=label, order=order, is_active=True,
        )


def backwards(apps, schema_editor):
    # Irreversible in a lossless way (In Progress fanned in from 5 old stages);
    # leave data as-is on reverse rather than guess a split.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0012_alter_enquiry_status'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
