"""
Seed a starter set of SMS templates.

These are DLT-*appropriate* — transactional/service tone, branded, no
promotional content — but not yet DLT-*registered*. Registration happens with
the operator (Jio/Airtel PE portal), and the id it returns goes in
`dlt_template_id` via the SMS Templates screen. Until then a send works in dev
(logged, not transmitted) and is rejected in production, which is correct: the
text is drafted, the compliance step is the admin's.

`dlt_template_id` is left blank on purpose. A fake id would look registered and
isn't — worse than an obviously-empty one that says "register me".

get_or_create keyed on name so re-running (or a fresh environment coming up to
this migration) doesn't duplicate, and so an admin who has already edited a
row's wording won't have it clobbered.
"""
from django.db import migrations

# (name, body) — body uses the {name}/{company}/{lead_id}/{consultant} blanks
# the send path fills. Kept service-explicit and brand-suffixed, which is what
# a DLT operator approves.
STARTER_TEMPLATES = [
    (
        "Enquiry received",
        "Dear {name}, we have received your enquiry {lead_id}. Our team will "
        "contact you shortly. - {consultant}, Sort String Solutions",
    ),
    (
        "Follow-up",
        "Dear {name}, following up on your enquiry {lead_id}. Please share your "
        "requirements at your convenience. - {consultant}, Sort String Solutions",
    ),
    (
        "Quotation ready",
        "Dear {name}, the quotation for your enquiry {lead_id} is ready. Kindly "
        "review and revert. - {consultant}, Sort String Solutions",
    ),
    (
        "Meeting scheduled",
        "Dear {name}, your meeting regarding enquiry {lead_id} has been scheduled. "
        "Details shared separately. - {consultant}, Sort String Solutions",
    ),
    (
        "Thank you",
        "Dear {name}, thank you for your time regarding enquiry {lead_id}. We will "
        "share the next steps shortly. - {consultant}, Sort String Solutions",
    ),
]


def seed(apps, schema_editor):
    SmsTemplate = apps.get_model("crm", "SmsTemplate")
    for name, body in STARTER_TEMPLATES:
        SmsTemplate.objects.get_or_create(
            name=name,
            defaults={"body": body, "dlt_template_id": "", "is_active": True},
        )


def unseed(apps, schema_editor):
    # Only remove the ones still matching the seeded name+body, so a template an
    # admin has since edited is left alone on a rollback.
    SmsTemplate = apps.get_model("crm", "SmsTemplate")
    for name, body in STARTER_TEMPLATES:
        SmsTemplate.objects.filter(name=name, body=body).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0018_smstemplate_alter_notification_ntype"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
