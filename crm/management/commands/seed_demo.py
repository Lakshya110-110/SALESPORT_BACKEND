"""
Seed the database with demo data that matches the Khwaishein mockups
(Param Dairy, Today Milk, reps, sample enquiries, meetings, notifications).

Idempotent: wipes activity data (enquiries + downstream) and recreates.
Users / companies / contacts / master data are get_or_create'd, not wiped.

Run:  python manage.py seed_demo
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta, time
import random

from crm.models import (
    User, Company, Contact, Enquiry, Touchpoint, NegotiationRound,
    Meeting, Proposal, Notification, MasterData,
)

MASTER = {
    "industry": [
        "Dairy", "FMCG", "Beverages", "Agri-inputs", "Cold chain",
        "Bakery", "Frozen foods", "Confectionery", "Ready-to-eat", "Nutraceuticals",
    ],
    "source": ["Referral", "Website", "Cold call", "Exhibition", "Partner"],
    "status": ["New", "In Progress", "Won", "Lost", "Spam"],
    "enquiry_type": ["Hot", "Warm", "Cold"],
    "mode": ["In-person", "Online", "Phone"],
}

REPS = [
    ("Ravi Kumar", "9876500001", "#2547C8"),
    ("Sneha Mehta", "9876500002", "#0F8A7E"),
    ("Priya Nair", "9876500003", "#B4531F"),
    ("Arjun Verma", "9876500004", "#7A3FB8"),
    ("Karan Singh", "9876500005", "#C0392B"),
]

COMPANIES = [
    # Core dairy / FMCG accounts — the original demo set.
    ("Param Dairy", "Dairy", "Lucknow"), ("Today Milk", "Dairy", "Kanpur"),
    ("Gyan Dairy", "Dairy", "Lucknow"), ("Anand Milk Union", "Dairy", "Anand"),
    ("Namaste India Foods", "FMCG", "Noida"), ("Heritage Foods", "Dairy", "Hyderabad"),
    ("Sudha Dairy", "Dairy", "Patna"), ("Mother Dairy F&V", "Dairy", "Delhi"),
    ("Crave Eatables", "Beverages", "Varanasi"), ("Hindustan Shudh Ghee", "FMCG", "Agra"),
    ("Saahaj Milk", "Dairy", "Meerut"), ("Maa Ganga Foods", "FMCG", "Haridwar"),
    ("Paras Dairy (VRS Foods)", "Dairy", "Faridabad"), ("Swadesh Milk", "Dairy", "Bhopal"),
    # Agri-inputs + Cold chain — previously named in MASTER but no companies used
    # them, so Top Industries never surfaced them.
    ("Krishi Agro Solutions", "Agri-inputs", "Indore"),
    ("Godrej Agrovet", "Agri-inputs", "Mumbai"),
    ("Snowman Logistics", "Cold chain", "Bengaluru"),
    ("ColdEx Chennai", "Cold chain", "Chennai"),
    # New industry buckets so Top Industries fills to the 10-row cap.
    ("Britannia Bakes", "Bakery", "Kolkata"),
    ("Modern Bread Foods", "Bakery", "Delhi"),
    ("McCain Foods India", "Frozen foods", "Ahmedabad"),
    ("Godrej Tyson Foods", "Frozen foods", "Pune"),
    ("Lotte India", "Confectionery", "Chennai"),
    ("Ravalgaon Sugar Farm", "Confectionery", "Nashik"),
    ("Kohinoor Speciality Foods", "Ready-to-eat", "Sonipat"),
    ("MTR Foods", "Ready-to-eat", "Bengaluru"),
    ("Amway Nutrilite India", "Nutraceuticals", "Gurugram"),
    ("Danone Nutrients", "Nutraceuticals", "Mumbai"),
]

SOURCES = ["Referral", "Website", "Cold call", "Exhibition", "Partner"]
TYPES = ["Hot", "Warm", "Cold"]

# Mirrors EnquiryViewSet.get_queryset's open_statuses in crm/views.py — used
# to pick which seeded enquiries are eligible to show up as "stalled" or in
# someone's "My Queue".
OPEN_STATUSES = ["New", "In Progress"]

# Status distributions per age band (weeks ago from today). Recent enquiries
# are mostly New/early; older ones have progressed to In Progress and then
# closed out as Won/Lost (with a little Spam in the tail).
STATUS_BY_AGE = [
    # (min_weeks, max_weeks, [(status, weight), ...])
    (0, 2,  [("New", 4), ("In Progress", 3)]),
    (2, 5,  [("New", 1), ("In Progress", 5)]),
    (5, 9,  [("In Progress", 3), ("Won", 2), ("Lost", 1)]),
    (9, 13, [("Won", 3), ("Lost", 2), ("Spam", 1)]),
]

TOUCHPOINT_TEMPLATES = [
    ("Call", "Spoke with buyer", "Discussed volumes and delivery cadence.", "Send introductory deck"),
    ("WhatsApp", "Shared brochure", "Sent product one-pager and testimonials.", "Follow up next week"),
    ("Email", "Sent quote", "Emailed price sheet and payment terms.", "Nudge if no reply by Fri"),
    ("Call", "Left voicemail", "No answer, left message with details.", "Try again tomorrow AM"),
    ("Note", "Internal update", "Team-side note: consider bundling logistics.", ""),
    ("WhatsApp", "Confirmed meeting", "Client confirmed on-site visit.", "Prep demo assets"),
    ("Email", "Requirement note", "Client shared spec sheet; reviewing.", "Draft revised quote"),
]


def _status_for(weeks_ago: int) -> str:
    for lo, hi, dist in STATUS_BY_AGE:
        if lo <= weeks_ago < hi:
            choices, weights = zip(*dist)
            return random.choices(choices, weights=weights, k=1)[0]
    # Fallback for anything beyond the last band
    return random.choice(["Won", "Lost"])


def _stamp(model, pk, created_at):
    """Backfill auto_now_add's `created_at` via a direct UPDATE."""
    model.objects.filter(pk=pk).update(created_at=created_at)


class Command(BaseCommand):
    help = "Seed demo data for Khwaishein"

    def add_arguments(self, parser):
        parser.add_argument(
            "--enquiries", type=int, default=50,
            help="How many enquiries to create (default 50)",
        )
        parser.add_argument(
            "--weeks", type=int, default=12,
            help="Spread enquiries across the last N weeks (default 12)",
        )

    def handle(self, *args, **opts):
        n_enq = opts["enquiries"]
        n_weeks = opts["weeks"]

        self.stdout.write("Seeding master data...")
        for cat, values in MASTER.items():
            for i, v in enumerate(values):
                MasterData.objects.get_or_create(
                    category=cat, value=v, defaults={"label": v, "order": i},
                )

        self.stdout.write("Seeding users...")
        admin, _ = User.objects.get_or_create(
            phone="9876543210",
            defaults={"name": "Abhishek Mishra", "role": "admin", "email": "abhishek.mishra@sortstring.com",
                      "avatar_color": "#16213D", "is_staff": True, "is_superuser": True},
        )
        reps = []
        for name, phone, color in REPS:
            u, _ = User.objects.get_or_create(
                phone=phone, defaults={"name": name, "role": "consultant", "avatar_color": color},
            )
            reps.append(u)

        self.stdout.write("Seeding companies + contacts...")
        companies = []
        for name, industry, city in COMPANIES:
            c, _ = Company.objects.get_or_create(
                name=name,
                defaults={"industry": industry, "city": city,
                          "gstin": f"09ABCDE{random.randint(1000,9999)}F1Z5",
                          "phone": f"98{random.randint(10000000,99999999)}"},
            )
            Contact.objects.get_or_create(
                company=c, name=f"{name.split()[0]} Manager",
                defaults={"designation": "Procurement Head", "is_primary": True,
                          "phone": f"98{random.randint(10000000,99999999)}",
                          "email": f"info@{name.split()[0].lower()}.in"},
            )
            companies.append(c)

        # Wipe activity data for a clean re-seed.
        self.stdout.write("Wiping activity data...")
        NegotiationRound.objects.all().delete()
        Touchpoint.objects.all().delete()
        Meeting.objects.all().delete()
        Proposal.objects.all().delete()
        Notification.objects.all().delete()
        Enquiry.objects.all().delete()

        self.stdout.write(f"Seeding {n_enq} enquiries across the last {n_weeks} weeks...")
        now = timezone.now()
        made = []
        # Build a week-index pool that guarantees at least `floor(n_enq / n_weeks)`
        # per week, then fills the remainder with a mild recent-bias so the
        # trend curve looks like real momentum rather than uniform noise.
        base = n_enq // n_weeks
        week_pool = [w for w in range(n_weeks) for _ in range(base)]
        while len(week_pool) < n_enq:
            week_pool.append(int(random.triangular(0, n_weeks - 1, n_weeks / 3)))
        random.shuffle(week_pool)
        for i in range(n_enq):
            weeks_ago = week_pool[i]
            days_offset = weeks_ago * 7 + random.randint(0, 6)
            hours_offset = random.randint(9, 18)
            created_at = now - timedelta(days=days_offset, hours=hours_offset)

            comp = random.choice(companies)
            contact = comp.contacts.first()
            status = _status_for(weeks_ago)

            # Lost enquiries get a real reason drawn from the model choices so
            # the Why-we-lose dashboard card shows the seeded distribution.
            LOST_REASON_WEIGHTS = [
                ("Price", 6), ("Competitor", 4), ("No budget", 3),
                ("Timing", 2), ("No response", 2),
                ("Feature gap", 2), ("Went in-house", 1),
                ("Other", 1),
            ]
            lost_reason = ""
            if status == "Lost":
                reasons, weights = zip(*LOST_REASON_WEIGHTS)
                lost_reason = random.choices(reasons, weights=weights, k=1)[0]

            enq = Enquiry.objects.create(
                company=comp, contact=contact,
                phone=contact.phone if contact else "",
                email=contact.email if contact else "",
                gstin=comp.gstin,
                source=random.choice(SOURCES),
                enquiry_type=random.choice(TYPES),
                status=status,
                industry=comp.industry,
                expected_value=random.choice([150000, 320000, 450000, 600000, 875000, 1200000, 1500000, 2400000]),
                expected_close_date=(created_at + timedelta(days=random.randint(15, 90))).date(),
                owner=random.choice(reps),
                description=f"{comp.name} · {status.lower()} stage · seeded demo lead.",
                lost_reason=lost_reason,
            )
            _stamp(Enquiry, enq.pk, created_at)
            enq.refresh_from_db()
            made.append(enq)

            # Touchpoints: 1-4 dated between enq.created_at and now (or resolution).
            tp_count = random.randint(1, 4)
            for j in range(tp_count):
                ch, outcome, note, next_action = random.choice(TOUCHPOINT_TEMPLATES)
                tp = Touchpoint.objects.create(
                    enquiry=enq, channel=ch, outcome=outcome, note=note,
                    next_action=next_action, created_by=enq.owner,
                )
                # Space touchpoints across the enquiry's lifespan. `life_days`
                # falls back to 1 for enquiries created only hours ago, but
                # created_at + up to (1 day + 18h) can then overshoot past
                # `now` into the future — a future-dated touchpoint sorts
                # above every real one forever, since the timeline orders by
                # created_at descending. Clamp to `now` so seed data can
                # never outrank a touchpoint the user logs for real.
                life_days = (now - created_at).days or 1
                tp_at = min(
                    created_at + timedelta(
                        days=random.randint(0, life_days),
                        hours=random.randint(9, 18),
                    ),
                    now,
                )
                _stamp(Touchpoint, tp.pk, tp_at)

        self.stdout.write("Seeding dashboard side-panel demo signals...")
        open_made = [e for e in made if e.status in OPEN_STATUSES]
        random.shuffle(open_made)

        # "My Queue" (owner=<caller>, open, closing within 7 days) is scoped
        # to whoever is logged in — every seeded owner is a rep, so the admin
        # account (the one everyone demos with) would always see an empty
        # queue. Hand admin a handful of open deals closing this week so the
        # card has something to show no matter who signs in.
        for enq in open_made[:5]:
            enq.owner = admin
            enq.expected_close_date = timezone.localdate() + timedelta(days=random.randint(1, 6))
            enq.save(update_fields=["owner", "expected_close_date"])

        # "Stalled deals" needs open enquiries whose `updated_at` is older
        # than STALE_DAYS. auto_now stamps updated_at at save time no matter
        # what we pass in, so a fresh reseed leaves every row "just touched"
        # and the card is empty until real time passes. Backdate updated_at
        # via a direct UPDATE (bypassing auto_now) for a realistic slice of
        # open deals so the card demos correctly right after a reseed.
        stale_slice = open_made[5:5 + max(6, len(open_made) // 3)]
        for enq in stale_slice:
            stale_at = now - timedelta(days=random.randint(4, 18), hours=random.randint(0, 23))
            stale_at = max(stale_at, enq.created_at + timedelta(hours=1))
            Enquiry.objects.filter(pk=enq.pk).update(updated_at=stale_at)

        self.stdout.write("Seeding meetings (past + upcoming)...")
        # ~35 meetings: 60% in the past (already scheduled_at earlier), 40% upcoming.
        for i in range(35):
            enq = random.choice(made)
            if i < 21:
                offset_days = -random.randint(1, 60)
                mstatus = random.choice(["Done", "Done", "Done", "Cancelled"])
            else:
                offset_days = random.randint(1, 21)
                mstatus = "Scheduled"
            when = now + timedelta(days=offset_days, hours=random.randint(-3, 5))
            purpose = random.choice(["Product demo", "Requirement gathering", "Pricing walkthrough", "Site visit"])
            m = Meeting.objects.create(
                enquiry=enq, company=enq.company,
                purpose=purpose,
                mode=random.choice(["In-person", "Online", "Phone"]),
                scheduled_at=when,
                consultant=enq.owner, location=enq.company.city or "Client office",
                status=mstatus,
                message="Meeting confirmation — details attached.",
            )
            # Meeting created_at just before scheduled_at, but never in the future.
            created_at_m = min(now, when) - timedelta(days=random.randint(1, 7))
            _stamp(Meeting, m.pk, created_at_m)

            # Done meetings get real outcome fields so the enquiry timeline +
            # the meeting card have realistic post-meeting context.
            if mstatus == "Done":
                sentiment = random.choices(
                    ["Positive", "Neutral", "Negative"],
                    weights=[5, 3, 2],
                    k=1,
                )[0]
                notes_by_sentiment = {
                    "Positive": f"{purpose} went well. Client showed strong interest; likely to advance.",
                    "Neutral":  f"{purpose} completed. Client acknowledged; awaiting internal review.",
                    "Negative": f"{purpose} had blockers — pricing/timing objections. Follow up in 2 weeks.",
                }
                m.outcome_sentiment = sentiment
                m.decision_maker_present = random.random() < 0.65
                m.outcome_notes = notes_by_sentiment[sentiment]
                m.save(update_fields=["outcome_sentiment", "decision_maker_present", "outcome_notes"])

                # Also drop a "Meeting" touchpoint on the linked enquiry so the
                # timeline reflects the outcome instead of relying on the older
                # Note+[Meeting] prefix hack.
                if enq:
                    tp = Touchpoint.objects.create(
                        enquiry=enq, channel="Meeting",
                        outcome=sentiment,
                        note=m.outcome_notes,
                        next_action="Send follow-up recap" if sentiment != "Negative" else "Escalate to admin",
                        created_by=enq.owner,
                    )
                    _stamp(Touchpoint, tp.pk, created_at_m + timedelta(hours=random.randint(2, 24)))

        self.stdout.write("Seeding proposals + negotiation rounds...")
        for enq in [e for e in made if e.status in ("In Progress", "Won")]:
            # Clamp to `now` — for a recently-created enquiry, created_at +
            # up to 10 days can land in the future.
            p = Proposal.objects.create(
                enquiry=enq, title=f"Proposal — {enq.company.name}",
                amount=enq.expected_value, status="Sent",
                sent_at=min(enq.created_at + timedelta(days=random.randint(2, 10)), now),
            )
            _stamp(Proposal, p.pk, min(enq.created_at + timedelta(days=random.randint(2, 10)), now))

        for enq in [e for e in made if e.status in ("In Progress", "Won")]:
            rounds = random.randint(1, 3)
            baseline = float(enq.expected_value)
            for r in range(rounds):
                # Alternate Our offer <-> Customer ask like the mockup timeline.
                side = "Our offer" if r % 2 == 0 else "Customer ask"
                if side == "Our offer":
                    amount = baseline * random.uniform(0.90, 1.00)
                    discount = round(random.uniform(0, 10), 1)
                    terms = random.choice([
                        "Initial proposal sent (SaaS, annual)",
                        "Revised quote — including on-prem add-on",
                        "Best-and-final offer, valid 7 days",
                    ])
                    status = random.choice(["Open", "Countered"])
                    our_q, client_o = amount, 0
                else:
                    amount = baseline * random.uniform(0.72, 0.88)
                    discount = round(random.uniform(5, 15), 1)
                    terms = random.choice([
                        "Customer countered — asked for 10% off + on-prem option",
                        "Wants 90-day payment terms",
                        "Willing to sign if pricing meets budget",
                    ])
                    status = random.choice(["Open", "Countered"])
                    our_q, client_o = 0, amount
                nr = NegotiationRound.objects.create(
                    enquiry=enq,
                    side=side,
                    our_quote=our_q,
                    client_budget=baseline * random.uniform(0.75, 0.88),
                    client_offer=client_o,
                    discount_pct=discount,
                    status=status,
                    note=terms,
                    created_by=enq.owner,
                )
                nr_at = min(enq.created_at + timedelta(days=10 + r * random.randint(3, 7)), now)
                _stamp(NegotiationRound, nr.pk, nr_at)
                # round_date follows created_at date.
                NegotiationRound.objects.filter(pk=nr.pk).update(round_date=nr_at.date())

        self.stdout.write("Seeding notifications...")
        Notification.objects.get_or_create(audience="admin", ntype="pending_approval",
            title="Discount approval pending", subtitle="Param Dairy · 15% discount requested")
        Notification.objects.get_or_create(audience="admin", ntype="discrepancy",
            title="Unassigned enquiries", subtitle="3 leads have no owner assigned")
        Notification.objects.get_or_create(audience="consultant", ntype="new_enquiry",
            title="New enquiry assigned", subtitle="Today Milk")
        Notification.objects.get_or_create(audience="all", ntype="meeting_reminder",
            title="Meeting reminder", subtitle="Param Dairy demo · 3:00 PM")

        # Report distribution so operators can spot-check the spread.
        from collections import Counter
        by_week = Counter()
        by_status = Counter()
        for e in Enquiry.objects.all():
            weeks_ago = (now - e.created_at).days // 7
            by_week[weeks_ago] += 1
            by_status[e.status] += 1
        self.stdout.write(f"  by week (0=this week): {dict(sorted(by_week.items()))}")
        self.stdout.write(f"  by status: {dict(by_status)}")

        self.stdout.write(self.style.SUCCESS(
            f"Done. Admin phone: 9876543210 (role admin). "
            f"Reps: {', '.join(p for _, p, _ in REPS)}. "
            f"Enquiries: {Enquiry.objects.count()}."
        ))
