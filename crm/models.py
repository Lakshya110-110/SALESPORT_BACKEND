"""
Data model for the Khwaishein Enterprise Lead Management CRM.
Mirrors the entities in the web console and the mobile field app.
"""
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone
from datetime import timedelta
import random


# ---------------------------------------------------------------------------
# Users (phone-based auth, roles admin / consultant)
# ---------------------------------------------------------------------------
class UserManager(BaseUserManager):
    def create_user(self, phone, name="", role="consultant", password=None, **extra):
        if not phone:
            raise ValueError("Users must have a phone number")
        user = self.model(phone=phone, name=name, role=role, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, name="Admin", password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        user = self.create_user(phone, name=name, role="admin", password=password, **extra)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = [("admin", "Admin"), ("consultant", "Consultant")]

    phone = models.CharField(max_length=15, unique=True)
    name = models.CharField(max_length=120)
    email = models.EmailField(blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="consultant")
    avatar_color = models.CharField(max_length=9, default="#2547C8")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.phone})"

    @property
    def initials(self):
        parts = self.name.split()
        return "".join(p[0] for p in parts[:2]).upper() if parts else "?"


# ---------------------------------------------------------------------------
# Phone OTP
# ---------------------------------------------------------------------------
class OTP(models.Model):
    phone = models.CharField(max_length=15, db_index=True)
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)

    @classmethod
    def issue(cls, phone):
        code = f"{random.randint(0, 999999):06d}"
        return cls.objects.create(phone=phone, code=code)

    def is_valid(self, ttl_seconds=300):
        if self.is_used:
            return False
        return timezone.now() <= self.created_at + timedelta(seconds=ttl_seconds)


# ---------------------------------------------------------------------------
# Master data (industries / sources / statuses / types / modes)
# ---------------------------------------------------------------------------
class MasterData(models.Model):
    CATEGORY_CHOICES = [
        ("industry", "Industry"),
        ("source", "Source"),
        ("status", "Status"),
        ("enquiry_type", "Enquiry Type"),
        ("mode", "Meeting Mode"),
    ]
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, db_index=True)
    value = models.CharField(max_length=60)
    label = models.CharField(max_length=80)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "order", "label"]
        unique_together = ("category", "value")

    def __str__(self):
        return f"{self.category}:{self.label}"


# ---------------------------------------------------------------------------
# Companies + Contacts
# ---------------------------------------------------------------------------
class Company(models.Model):
    name = models.CharField(max_length=160)
    industry = models.CharField(max_length=60, default="Dairy")
    gstin = models.CharField(max_length=20, blank=True)
    phone = models.CharField(max_length=15, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "Companies"

    def __str__(self):
        return self.name


class Contact(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="contacts")
    name = models.CharField(max_length=120)
    designation = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=15, blank=True)
    email = models.EmailField(blank=True)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_primary", "name"]

    def __str__(self):
        return f"{self.name} @ {self.company.name}"


# ---------------------------------------------------------------------------
# Enquiries (Leads)
# ---------------------------------------------------------------------------
class Enquiry(models.Model):
    STATUS_CHOICES = [
        ("Enquiry", "Enquiry"),
        ("Qualified", "Qualified"),
        ("Meeting Scheduled", "Meeting Scheduled"),
        ("Meeting Done", "Meeting Done"),
        ("Proposal Sent", "Proposal Sent"),
        ("Negotiation", "Negotiation"),
        ("Won", "Won"),
        ("Lost", "Lost"),
    ]
    TYPE_CHOICES = [("Hot", "Hot"), ("Warm", "Warm"), ("Cold", "Cold")]

    LOST_REASON_CHOICES = [
        ("Price", "Price"),
        ("Timing", "Timing"),
        ("Competitor", "Competitor"),
        ("No budget", "No budget"),
        ("No response", "No response"),
        ("Feature gap", "Feature gap"),
        ("Went in-house", "Went in-house"),
        ("Other", "Other"),
    ]

    # Which Sort String product/service this enquiry is actually for — the
    # core list matches sortstring.com's real product lineup (SalesPort is
    # the flagship DMS+SFA product this very CRM ships as); "Other" pairs
    # with `solution_type_other` for a one-off custom ask.
    SOLUTION_TYPE_CHOICES = [
        ("SalesPort (DMS + SFA)", "SalesPort (DMS + SFA)"),
        ("Supply Chain Management", "Supply Chain Management"),
        ("Procurement Management", "Procurement Management"),
        ("Livestock Management", "Livestock Management"),
        ("Inventory Management", "Inventory Management"),
        ("Production Management", "Production Management"),
        ("Accounts Management", "Accounts Management"),
        ("HR Management", "HR Management"),
        ("Institute Management & Resource Optimization", "Institute Management & Resource Optimization"),
        ("Other", "Other"),
    ]

    # Derived-type bands (calendar days to expected_close_date). The web's
    # lib/utils/leadType.ts mirrors these numbers — keep them in sync.
    HOT_DAYS = 14
    WARM_DAYS = 45
    # An open deal counts as "stalled" once updated_at is this many days old.
    STALE_DAYS = 3

    lead_id = models.CharField(max_length=20, unique=True, blank=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="enquiries")
    contact = models.ForeignKey(Contact, on_delete=models.SET_NULL, null=True, blank=True, related_name="enquiries")
    phone = models.CharField(max_length=15, blank=True)
    email = models.EmailField(blank=True)
    gstin = models.CharField(max_length=20, blank=True)
    source = models.CharField(max_length=40, default="Website")
    enquiry_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default="Warm")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="Enquiry")
    industry = models.CharField(max_length=60, default="Dairy")
    solution_type = models.CharField(max_length=60, choices=SOLUTION_TYPE_CHOICES, blank=True)
    solution_type_other = models.CharField(max_length=200, blank=True)
    expected_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_close_date = models.DateField(null=True, blank=True)
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="enquiries")
    description = models.TextField(blank=True)
    lost_reason = models.CharField(max_length=20, choices=LOST_REASON_CHOICES, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Enquiries"

    def __str__(self):
        return f"{self.lead_id} · {self.company.name}"

    @property
    def derived_type(self) -> str:
        """Hot/Warm/Cold from how soon the deal closes (see HOT/WARM_DAYS)."""
        if not self.expected_close_date:
            return "Cold"
        days = (self.expected_close_date - timezone.localdate()).days
        if days <= self.HOT_DAYS:
            return "Hot"
        if days <= self.WARM_DAYS:
            return "Warm"
        return "Cold"

    def save(self, *args, **kwargs):
        if not self.lead_id:
            year = timezone.now().year
            last = Enquiry.objects.filter(lead_id__startswith=f"LEAD-{year}-").order_by("-lead_id").first()
            seq = int(last.lead_id.split("-")[-1]) + 1 if last else 1
            self.lead_id = f"LEAD-{year}-{seq:04d}"
        super().save(*args, **kwargs)


class Touchpoint(models.Model):
    CHANNEL_CHOICES = [
        ("Call", "Call"), ("WhatsApp", "WhatsApp"), ("SMS", "SMS"),
        ("Email", "Email"), ("Note", "Note"), ("Meeting", "Meeting"),
        ("Negotiation", "Negotiation"),
    ]
    SENTIMENT_CHOICES = [("Hot", "Hot"), ("Warm", "Warm"), ("Cold", "Cold")]
    DIRECTION_CHOICES = [("Outbound", "Outbound"), ("Inbound", "Inbound")]

    enquiry = models.ForeignKey(Enquiry, on_delete=models.CASCADE, related_name="touchpoints")
    channel = models.CharField(max_length=15, choices=CHANNEL_CHOICES, default="Call")
    outcome = models.CharField(max_length=120, blank=True)
    note = models.TextField(blank=True)
    next_action = models.CharField(max_length=160, blank=True)
    next_action_date = models.DateField(null=True, blank=True)
    # Composer extras — real columns instead of being flattened into `note`,
    # so they're filterable/reportable later. Channel-specific ones
    # (direction/duration: Call, subject: Email, is_private: Note) stay
    # blank/False on other channels.
    sentiment = models.CharField(max_length=6, choices=SENTIMENT_CHOICES, blank=True)
    direction = models.CharField(max_length=8, choices=DIRECTION_CHOICES, blank=True)
    duration_sec = models.PositiveIntegerField(null=True, blank=True)
    subject = models.CharField(max_length=200, blank=True)
    is_private = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class NegotiationRound(models.Model):
    SIDE_CHOICES = [("Our offer", "Our offer"), ("Customer ask", "Customer ask")]
    STATUS_CHOICES = [
        ("Open", "Open"),
        ("Accepted", "Accepted"),
        ("Rejected", "Rejected"),
        ("Countered", "Countered"),
    ]

    enquiry = models.ForeignKey(Enquiry, on_delete=models.CASCADE, related_name="negotiation_rounds")
    side = models.CharField(max_length=20, choices=SIDE_CHOICES, default="Our offer")
    our_quote = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    client_budget = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    client_offer = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    note = models.CharField(max_length=255, blank=True)
    round_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="Open")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    @property
    def gap(self):
        return self.our_quote - self.client_offer


# ---------------------------------------------------------------------------
# Meetings
# ---------------------------------------------------------------------------
class FollowUp(models.Model):
    """A scheduled next-action against an enquiry.

    Follow-ups are the field consultant's daily "to-do" list. They can be
    created manually (via the Enquiry detail's Follow-up button) or
    auto-derived from a Touchpoint's `next_action_date`. Django-Q2 sweeps
    overdue ones on a schedule and creates an `overdue` Notification.
    """

    STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Done", "Done"),
        ("Snoozed", "Snoozed"),
        ("Cancelled", "Cancelled"),
    ]

    enquiry = models.ForeignKey("Enquiry", on_delete=models.CASCADE, related_name="follow_ups")
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="follow_ups")
    title = models.CharField(max_length=160)
    notes = models.TextField(blank=True)
    due_at = models.DateTimeField()
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="Pending")
    completed_at = models.DateTimeField(null=True, blank=True)
    # If auto-created from a Touchpoint, link back so admins can trace the
    # origin. Nullable for manually-created follow-ups.
    source_touchpoint = models.ForeignKey(
        "Touchpoint", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="follow_ups",
    )
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="follow_ups_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["due_at"]

    def __str__(self):
        return f"{self.title} · {self.due_at:%Y-%m-%d}"

    @property
    def is_overdue(self):
        return self.status == "Pending" and self.due_at < timezone.now()


class Meeting(models.Model):
    MODE_CHOICES = [("In-person", "In-person"), ("Online", "Online"), ("Phone", "Phone")]
    STATUS_CHOICES = [("Scheduled", "Scheduled"), ("Done", "Done"), ("Cancelled", "Cancelled")]
    OUTCOME_CHOICES = [("Positive", "Positive"), ("Neutral", "Neutral"), ("Negative", "Negative")]

    enquiry = models.ForeignKey(Enquiry, on_delete=models.SET_NULL, null=True, blank=True, related_name="meetings")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="meetings")
    purpose = models.CharField(max_length=160)
    mode = models.CharField(max_length=15, choices=MODE_CHOICES, default="In-person")
    scheduled_at = models.DateTimeField()
    duration_min = models.PositiveIntegerField(default=30)
    location = models.CharField(max_length=200, blank=True)
    consultant = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="meetings")
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="Scheduled")
    notify_email = models.BooleanField(default=True)
    notify_whatsapp = models.BooleanField(default=True)
    message = models.TextField(blank=True)
    # Structured notification content — the actual text sent (once a real
    # provider is wired up) via NotificationService, distinct from `message`
    # above which stays a free-form agenda/attendee summary.
    email_subject = models.CharField(max_length=200, blank=True)
    email_body = models.TextField(blank=True)
    whatsapp_message = models.TextField(blank=True)
    # Reason given for the most recent reschedule; blank if never rescheduled.
    reschedule_reason = models.CharField(max_length=100, blank=True)
    # Real outcome fields — replace the earlier `<<outcome:v1>>` hack in `message`.
    outcome_sentiment = models.CharField(max_length=10, choices=OUTCOME_CHOICES, blank=True)
    decision_maker_present = models.BooleanField(null=True, blank=True)
    outcome_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["scheduled_at"]

    def __str__(self):
        return f"{self.company.name} · {self.purpose}"


# ---------------------------------------------------------------------------
# Proposals
# ---------------------------------------------------------------------------
class Proposal(models.Model):
    STATUS_CHOICES = [
        ("Draft", "Draft"), ("Sent", "Sent"), ("Viewed", "Viewed"),
        ("Accepted", "Accepted"), ("Rejected", "Rejected"),
    ]
    enquiry = models.ForeignKey(Enquiry, on_delete=models.CASCADE, related_name="proposals")
    title = models.CharField(max_length=160)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="Draft")
    # Real file storage: FileField writes to MEDIA_ROOT/proposals/YYYY/MM/. The
    # `file_url` column is kept as a fallback for any external URL a user pastes
    # (backward-compat with earlier rows and pre-storage seed data).
    file = models.FileField(upload_to="proposals/%Y/%m/", blank=True, null=True, max_length=500)
    file_url = models.URLField(blank=True, max_length=500)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


# ---------------------------------------------------------------------------
# Notifications (role-aware)
# ---------------------------------------------------------------------------
class Notification(models.Model):
    AUDIENCE_CHOICES = [("admin", "Admin"), ("consultant", "Consultant"), ("all", "All")]
    TYPE_CHOICES = [
        ("pending_approval", "Pending approval"),
        ("discrepancy", "Discrepancy"),
        ("new_enquiry", "New enquiry"),
        ("overdue", "Overdue follow-up"),
        ("proposal_opened", "Proposal opened"),
        ("meeting_reminder", "Meeting reminder"),
        ("deal_won", "Deal won"),
        ("status_changed", "Status changed"),
        ("team_update", "Team update"),
    ]
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name="notifications")
    audience = models.CharField(max_length=15, choices=AUDIENCE_CHOICES, default="all")
    ntype = models.CharField(max_length=25, choices=TYPE_CHOICES, default="new_enquiry")
    title = models.CharField(max_length=160)
    subtitle = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    link_type = models.CharField(max_length=30, blank=True)  # enquiry / meeting / proposal / team
    link_id = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.ntype}] {self.title}"
