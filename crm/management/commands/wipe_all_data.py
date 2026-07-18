"""
Empty the CRM back to a blank slate so genuine data can be entered from scratch.

Dry-run by DEFAULT. Deletion needs `--apply`, so a mistyped command reports
instead of destroying.

REMOVED: every enquiry, touchpoint, negotiation round, follow-up, proposal,
meeting, notification, company and contact — plus all users except the ones
named in --keep, and all OTP rows (short-lived login codes; stale within
minutes and worthless once the accounts they belong to are gone).

KEPT, deliberately:
  * MasterData — industries, sources, statuses, modes. These populate every
    dropdown in the enquiry form. Wiping them doesn't give a clean slate, it
    gives an app whose forms can't be filled in.
  * The --keep users. Deleting every account locks everyone out of the system
    permanently, including whoever runs this command.

Two refusals, checked before anything is touched: it will not run if a --keep
phone doesn't exist in the database (a typo would otherwise silently delete the
account it was meant to protect), and it will not run unless at least one
surviving user is an admin (a database nobody can administer is a locked door).

Enquiry has no soft-delete column. This is a HARD delete and there is no undo:
    mysqldump -u <user> -p <db> > backup_before_wipe.sql
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from crm.models import (
    OTP,
    Company,
    Contact,
    Enquiry,
    FollowUp,
    MasterData,
    Meeting,
    NegotiationRound,
    Notification,
    Proposal,
    Touchpoint,
    User,
)

DEFAULT_KEEP = ["7388232211", "9452672531", "8273563481"]

# Order matters only for readability — the wipe runs in one transaction and
# children go before parents so nothing depends on cascade behaviour.
WIPE_MODELS = [
    Notification,
    Touchpoint,
    NegotiationRound,
    FollowUp,
    Proposal,
    Meeting,
    Enquiry,
    Contact,
    Company,
    OTP,
]


class Command(BaseCommand):
    help = "Delete all CRM data for a fresh start (dry-run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Actually delete. Without this the command only reports.",
        )
        parser.add_argument(
            "--keep", nargs="+", default=DEFAULT_KEEP, metavar="PHONE",
            help="Phone numbers of users to keep. Default: %s" % " ".join(DEFAULT_KEEP),
        )

    def handle(self, *args, **opts):
        keep = list(opts["keep"])
        found = set(User.objects.filter(phone__in=keep).values_list("phone", flat=True))

        # Refuse on a typo rather than delete the account it was meant to save.
        missing = [p for p in keep if p not in found]
        if missing:
            raise CommandError(
                "These --keep numbers are not in the database: %s\n"
                "Refusing to run: a mistyped number would delete the very account "
                "it was meant to protect." % ", ".join(missing)
            )

        survivors = User.objects.filter(phone__in=keep)
        if not survivors.filter(role="admin").exists():
            raise CommandError(
                "None of the --keep users has role='admin'. Refusing to run: the "
                "result would be a database nobody can administer."
            )

        doomed_users = User.objects.exclude(phone__in=keep)

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("WILL DELETE"))
        for model in WIPE_MODELS:
            self.stdout.write(f"  {model.__name__:<20} {model.objects.count()}")
        self.stdout.write(f"  {'Users':<20} {doomed_users.count()}")
        for u in doomed_users:
            self.stdout.write(f"      - {u.phone}  {u.name}")

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("WILL KEEP"))
        self.stdout.write(
            f"  MasterData           {MasterData.objects.count()}"
            "  (dropdown values — the forms need these)"
        )
        self.stdout.write(f"  Users                {survivors.count()}")
        for u in survivors:
            self.stdout.write(f"      - {u.phone}  {u.name:<18} role={u.role} super={u.is_superuser}")

        if not opts["apply"]:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("DRY RUN — nothing was deleted. Re-run with --apply to delete."))
            self.stdout.write(self.style.WARNING("Take a mysqldump first. There is no undo."))
            return

        with transaction.atomic():
            for model in WIPE_MODELS:
                model.objects.all().delete()
            doomed_users.delete()

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Wiped. The CRM is empty and ready for genuine data."))
        for model in WIPE_MODELS:
            self.stdout.write(f"  {model.__name__:<20} {model.objects.count()}")
        self.stdout.write(f"  {'Users':<20} {User.objects.count()}")
