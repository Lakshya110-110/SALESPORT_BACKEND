from rest_framework import serializers
from .models import (
    User, Company, Contact, Enquiry, Touchpoint, NegotiationRound,
    Meeting, Proposal, Notification, MasterData, FollowUp,
)


class UserSerializer(serializers.ModelSerializer):
    initials = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = ["id", "phone", "name", "email", "role", "avatar_color", "initials", "is_active", "created_at"]
        read_only_fields = ["created_at"]


class MasterDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterData
        fields = ["id", "category", "value", "label", "order", "is_active"]


class ContactSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = Contact
        fields = ["id", "company", "company_name", "name", "designation", "phone", "email", "is_primary", "created_at"]
        read_only_fields = ["created_at"]


class CompanySerializer(serializers.ModelSerializer):
    contact_count = serializers.IntegerField(source="contacts.count", read_only=True)

    class Meta:
        model = Company
        fields = ["id", "name", "industry", "gstin", "phone", "email", "address", "city", "contact_count", "created_at"]
        read_only_fields = ["created_at"]


class TouchpointSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)

    class Meta:
        model = Touchpoint
        fields = ["id", "enquiry", "channel", "outcome", "note", "next_action",
                  "next_action_date", "sentiment", "direction", "duration_sec",
                  "subject", "is_private", "created_by", "created_by_name", "created_at"]
        read_only_fields = ["created_by", "created_at"]


class NegotiationRoundSerializer(serializers.ModelSerializer):
    gap = serializers.ReadOnlyField()
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)

    class Meta:
        model = NegotiationRound
        fields = ["id", "enquiry", "side", "our_quote", "client_budget", "client_offer",
                  "discount_pct", "round_date", "status", "gap", "note",
                  "created_by", "created_by_name", "created_at"]
        read_only_fields = ["created_by", "created_at"]


PROPOSAL_MAX_FILE_MB = 10


class ProposalSerializer(serializers.ModelSerializer):
    # `file` is write-only (multipart upload); `file_url` is the readable
    # download link the frontend uses. When a file is attached, we surface its
    # storage URL; otherwise we fall back to whatever URL was stored earlier.
    file = serializers.FileField(write_only=True, required=False, allow_null=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Proposal
        fields = ["id", "enquiry", "title", "amount", "status", "file", "file_url", "sent_at", "created_at"]
        read_only_fields = ["created_at"]

    def validate_file(self, value):
        # The client only ever offers "PDF up to 10MB" — this is the actual
        # enforcement. Extension/content-type headers are client-supplied and
        # trivially spoofed, so the magic-bytes check is what actually stops
        # someone uploading an arbitrary file (e.g. an SVG/HTML with a script
        # payload) renamed to .pdf.
        if value is None:
            return value
        max_bytes = PROPOSAL_MAX_FILE_MB * 1024 * 1024
        if value.size > max_bytes:
            raise serializers.ValidationError(
                f"File is too large (max {PROPOSAL_MAX_FILE_MB} MB)."
            )
        if not value.name.lower().endswith(".pdf"):
            raise serializers.ValidationError("Only PDF files are accepted.")
        head = value.read(5)
        value.seek(0)
        if head != b"%PDF-":
            raise serializers.ValidationError("File does not look like a valid PDF.")
        return value

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get("request")
            url = obj.file.url
            return request.build_absolute_uri(url) if request else url
        return obj.file_url or ""

    def create(self, validated_data):
        # If a file was uploaded, keep the URLField in sync so old consumers
        # that read `file_url` directly from the DB still see something sane.
        file = validated_data.pop("file", None)
        instance = super().create(validated_data)
        if file:
            instance.file = file
            instance.save(update_fields=["file"])
        return instance

    def update(self, instance, validated_data):
        file = validated_data.pop("file", None)
        instance = super().update(instance, validated_data)
        if file is not None:
            instance.file = file
            instance.save(update_fields=["file"])
        return instance


class MeetingSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    consultant_name = serializers.CharField(source="consultant.name", read_only=True)

    class Meta:
        model = Meeting
        fields = ["id", "enquiry", "company", "company_name", "purpose", "mode",
                  "scheduled_at", "duration_min", "location", "consultant", "consultant_name",
                  "status", "notify_email", "notify_whatsapp", "message",
                  "email_subject", "email_body", "whatsapp_message", "reschedule_reason",
                  "outcome_sentiment", "decision_maker_present", "outcome_notes",
                  "created_at"]
        read_only_fields = ["created_at"]

    def validate(self, attrs):
        """Outcome fields only make sense on a Done meeting.

        Cancelled meetings must not carry outcome data (nothing happened) and
        Scheduled meetings can't preload sentiment / DM presence / notes
        (nothing has happened yet). The frontend already gates this via the
        Mark-done modal; the check here defends the API for direct callers
        (mobile field app, integrations).
        """
        # `partial=True` means the instance's current values fill unset fields.
        instance = self.instance
        status_val = attrs.get("status") or (instance.status if instance else None)
        outcome_keys = ("outcome_sentiment", "decision_maker_present", "outcome_notes")
        for key in outcome_keys:
            sent = attrs.get(key)
            if status_val != "Done" and sent not in (None, "", False):
                # False on the boolean is treated the same as "unset" so a
                # frontend can safely include the field in every PATCH.
                if key == "decision_maker_present" and sent is False:
                    continue
                raise serializers.ValidationError(
                    {key: "Only Done meetings can carry outcome fields."},
                )
        return attrs


class EnquiryListSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    owner_name = serializers.CharField(source="owner.name", read_only=True)
    contact_name = serializers.CharField(source="contact.name", read_only=True)
    # Hot/Warm/Cold computed from expected_close_date (model property) —
    # clients should render THIS, not the vestigial enquiry_type column.
    derived_type = serializers.ReadOnlyField()
    # Timestamp of the most recent touchpoint on this enquiry (call /
    # WhatsApp / email / meeting / note). Used by the dashboard "Stalled
    # deals" panel to show "days since last touch" without a second call.
    last_touch_at = serializers.SerializerMethodField()

    def get_last_touch_at(self, obj):
        latest = obj.touchpoints.order_by("-created_at").values_list(
            "created_at", flat=True,
        ).first()
        return latest

    # Scheduled follow-up date — only populated on the "My Queue" slice, which
    # annotates `followup_date` (the latest touchpoint's next_action_date).
    # getattr keeps it a no-op (no extra query) on every other list response.
    next_followup_at = serializers.SerializerMethodField()

    def get_next_followup_at(self, obj):
        return getattr(obj, "followup_date", None)

    class Meta:
        model = Enquiry
        fields = ["id", "lead_id", "company", "company_name", "contact", "contact_name",
                  "phone", "email", "source", "enquiry_type", "derived_type", "status",
                  "industry", "expected_value", "expected_close_date", "owner", "owner_name",
                  "lost_reason", "last_touch_at", "next_followup_at", "created_at", "updated_at"]


class EnquiryDetailSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    contact_name = serializers.CharField(source="contact.name", read_only=True)
    owner_name = serializers.CharField(source="owner.name", read_only=True)
    derived_type = serializers.ReadOnlyField()
    touchpoints = TouchpointSerializer(many=True, read_only=True)
    negotiation_rounds = NegotiationRoundSerializer(many=True, read_only=True)
    proposals = ProposalSerializer(many=True, read_only=True)
    meetings = MeetingSerializer(many=True, read_only=True)

    class Meta:
        model = Enquiry
        fields = ["id", "lead_id", "company", "company_name", "contact", "contact_name", "phone", "email",
                  "gstin", "source", "enquiry_type", "derived_type", "status", "industry",
                  "solution_type", "solution_type_other",
                  "expected_value", "expected_close_date", "owner", "owner_name",
                  "description", "lost_reason",
                  "touchpoints", "negotiation_rounds", "proposals", "meetings",
                  "created_at", "updated_at"]
        read_only_fields = ["lead_id", "created_at", "updated_at"]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "audience", "ntype", "title", "subtitle", "is_read",
                  "link_type", "link_id", "created_at"]
        read_only_fields = ["created_at"]


class FollowUpSerializer(serializers.ModelSerializer):
    """Serializer for the Phase 7 follow-up list. `is_overdue` and the linked
    enquiry's headline fields are exposed so the field-app can render the row
    without a second round-trip."""

    is_overdue = serializers.ReadOnlyField()
    enquiry_lead_id = serializers.CharField(source="enquiry.lead_id", read_only=True)
    company_name = serializers.CharField(source="enquiry.company.name", read_only=True)
    owner_name = serializers.CharField(source="owner.name", read_only=True)

    class Meta:
        model = FollowUp
        fields = ["id", "enquiry", "enquiry_lead_id", "company_name",
                  "owner", "owner_name", "title", "notes", "due_at",
                  "status", "completed_at", "source_touchpoint", "is_overdue",
                  "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at", "completed_at"]


# ---- Auth payloads ----
class RequestOTPSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)


class VerifyOTPSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)
    code = serializers.CharField(max_length=6)
    # No `role` field: the login endpoint must not let a client choose its own
    # role (that allowed self-registering as admin). New users default to
    # consultant server-side; see verify_otp in views.py.
