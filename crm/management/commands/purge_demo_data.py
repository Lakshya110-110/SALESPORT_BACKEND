"""
Remove seed_demo's demo rows so a live database is left with real work only.

Dry-run by DEFAULT — it prints what it would remove and changes nothing. Actual
deletion needs `--apply`, so a mistyped command is a report, not an incident.

Identification is exact, not heuristic: seed_demo stamps every enquiry it makes
with "... · seeded demo lead." in the description (see seed_demo.py), and its
five rep accounts have reserved 98765000xx phone numbers. Nothing here guesses
from dates, owners or company names.

WHAT THIS CANNOT DO: hand-typed junk ("Ttt", "vxcv", a company someone mashed
into the form while testing) is indistinguishable from a real lead — the seeder
never touched it and it carries no marker. Those must be deleted by id after a
human reads the list. `--list-remaining` prints exactly that list.

Enquiry has no soft-delete column, so this is a HARD delete. Take a dump first:
    mysqldump -u <user> -p <db> > backup_before_purge.sql
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from crm.models import (
    Company,
    Enquiry,
    FollowUp,
    Meeting,
    NegotiationRound,
    Notification,
    Proposal,
    Touchpoint,
    User,
)

SEED_MARKER = "seeded demo lead."
SEED_REP_PHONE_PREFIX = "98765000"


class Command(BaseCommand):
    help = "Delete seed_demo demo data (dry-run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Actually delete. Without this the command only reports.",
        )
        parser.add_argument(
            "--include-companies", action="store_true",
            help=(
                "Also delete demo companies that end up with no enquiries. Off by "
                "default: several are real firms you may actually sell to, and a "
                "company is cheap to keep but annoying to re-enter."
            ),
        )
        parser.add_argument(
            "--keep-reps", action="store_true",
            help="Keep the five 98765000xx demo rep accounts.",
        )
        parser.add_argument(
            "--list-remaining", action="store_true",
            help="After the summary, list every surviving enquiry for manual review.",
        )

    def handle(self, *args, **opts):
        apply_changes = opts["apply"]
        seeded = Enquiry.objects.filter(description__contains=SEED_MARKER)
        seeded_ids = list(seeded.values_list("id", flat=True))

        # Meeting.enquiry is SET_NULL, not CASCADE — deleting the enquiries alone
        # would leave these orphaned in the meetings list with no parent, visible
        # forever and attributable to nothing. Collect them for explicit removal.
        meetings = Meeting.objects.filter(enquiry_id__in=seeded_ids)
        # Notification points at an enquiry by (link_type, link_id) strings rather
        # than a FK, so the database won't cascade these either.
        notifications = Notification.objects.filter(
            link_type="enquiry", link_id__in=[str(i) for i in seeded_ids]
        )
        reps = User.objects.filter(phone__startswith=SEED_REP_PHONE_PREFIX)

        counts = {
            "enquiries": len(seeded_ids),
            "touchpoints": Touchpoint.objects.filter(enquiry_id__in=seeded_ids).count(),
            "negotiation rounds": NegotiationRound.objects.filter(enquiry_id__in=seeded_ids).count(),
            "follow-ups": FollowUp.objects.filter(enquiry_id__in=seeded_ids).count(),
            "proposals": Proposal.objects.filter(enquiry_id__in=seeded_ids).count(),
            "meetings": meetings.count(),
            "notifications": notifications.count(),
            "demo rep accounts": 0 if opts["keep_reps"] else reps.count(),
        }

        surviving = Enquiry.objects.exclude(id__in=seeded_ids)

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Demo rows identified by marker"))
        for label, n in counts.items():
            self.stdout.write(f"  {label:<20} {n}")
        self.stdout.write(f"\n  enquiries that SURVIVE : {surviving.count()}")

        if opts["list_remaining"]:
            self.stdout.write("")
            self.stdout.write(self.style.MIGRATE_HEADING("Surviving enquiries — review these by hand"))
            self.stdout.write("  (the seeder never made these; junk and real leads look alike here)")
            for e in surviving.select_related("company", "owner").order_by("id"):
                owner = getattr(e.owner, "name", None) or "—"
                self.stdout.write(
                    f"    id={e.id:<5} {e.lead_id:<16} {e.company.name[:30]:<32} "
                    f"{owner[:18]:<20} {e.created_at:%Y-%m-%d}"
                )

        if not apply_changes:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("DRY RUN — nothing was deleted. Re-run with --apply to delete."))
            self.stdout.write(self.style.WARNING("Take a mysqldump first; Enquiry has no soft-delete to undo this."))
            return

        # One transaction: a failure part-way through must not leave enquiries
        # gone but their meetings and notifications still pointing at nothing.
        with transaction.atomic():
            notifications.delete()
            meetings.delete()
            # Touchpoints, negotiation rounds, follow-ups and proposals are all
            # CASCADE, so deleting the enquiries takes them with it.
            seeded.delete()
            if not opts["keep_reps"]:
                reps.delete()
            if opts["include_companies"]:
                # Only companies left with nothing attached — never one that a
                # real enquiry still references.
                orphans = Company.objects.filter(enquiries__isnull=True)
                counts["companies"] = orphans.count()
                orphans.delete()

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Deleted. Remaining enquiries: %d" % Enquiry.objects.count()))
        self.stdout.write(
            "Anything left that isn't a real lead is hand-typed test data — "
            "run with --list-remaining and delete those by id."
        )
