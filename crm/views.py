from django.conf import settings
from django.db.models import Count, Sum, Q, OuterRef, Subquery
from django.http import Http404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    User, OTP, Company, Contact, Enquiry, Touchpoint, NegotiationRound,
    Meeting, Proposal, Notification, MasterData, FollowUp,
)
from .serializers import (
    UserSerializer, CompanySerializer, ContactSerializer,
    EnquiryListSerializer, EnquiryDetailSerializer, TouchpointSerializer,
    NegotiationRoundSerializer, MeetingSerializer, ProposalSerializer,
    NotificationSerializer, MasterDataSerializer, FollowUpSerializer,
    RequestOTPSerializer, VerifyOTPSerializer,
)
from .permissions import IsAdminRole
from .phone import normalize_phone
from .sockets import (
    emit_notification, emit_enquiry_event, emit_enquiry_action,
    emit_user_created, emit_user_updated, emit_user_deleted,
)
from .notifications import get_notification_service
from .otp_delivery import get_otp_delivery_service, SmsSendError


# ===========================================================================
# Auth: phone -> OTP -> JWT  (matches both the web and mobile logins)
# ===========================================================================
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def request_otp(request):
    ser = RequestOTPSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    phone = normalize_phone(ser.validated_data["phone"])
    # Only issue an OTP to a registered, active account — so the client (web or
    # mobile) is rejected at the "Send OTP" step and never advances to the OTP
    # screen for a number that can't sign in, and no SMS goes to a non-user.
    # Login never creates accounts; admins add users via the Users page.
    try:
        user = User.objects.get(phone=phone)
    except User.DoesNotExist:
        return Response(
            {"detail": "This number isn't registered. Ask an administrator to add you."},
            status=status.HTTP_404_NOT_FOUND,
        )
    if not user.is_active:
        return Response(
            {"detail": "This account has been deactivated. Contact an administrator."},
            status=status.HTTP_403_FORBIDDEN,
        )
    otp = OTP.issue(phone)
    try:
        result = get_otp_delivery_service().send_otp(phone=phone, code=otp.code)
    except SmsSendError as exc:
        # Don't claim "OTP sent" for a message that never left — the user
        # would sit on the OTP screen waiting for a code that isn't coming.
        # 502: we're fine, the upstream gateway isn't. The issued OTP is left
        # to expire on its own; nothing is leaked by that.
        return Response(
            {"detail": f"Couldn't send the OTP right now. {exc} Please try again."},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    payload = {"detail": "OTP sent", "phone": phone}
    if result.get("echo_in_response"):
        payload["otp"] = otp.code  # DEV/TEST ONLY — see crm/otp_delivery.py
    return Response(payload)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def verify_otp(request):
    ser = VerifyOTPSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    phone = normalize_phone(ser.validated_data["phone"])
    code = ser.validated_data["code"].strip()

    # Check the account FIRST — before validating/consuming the OTP — so an
    # unregistered number always gets a clear "not registered" message instead
    # of falling through to "invalid or expired OTP" (which happens once the
    # code has been consumed by a prior attempt or has aged out). Login never
    # creates accounts: only a phone an admin has already added can sign in,
    # otherwise anyone who can receive an OTP could self-provision an account
    # (web OR the mobile app). Admins add users via the Users page
    # (POST /api/users/, IsAdminRole); the first admin comes from
    # createsuperuser / seed_demo.
    try:
        user = User.objects.get(phone=phone)
    except User.DoesNotExist:
        return Response(
            {"detail": "This number isn't registered. Ask an administrator to add you."},
            status=status.HTTP_404_NOT_FOUND,
        )
    # A deactivated account (Active toggle off) must not be able to sign in.
    if not user.is_active:
        return Response(
            {"detail": "This account has been deactivated. Contact an administrator."},
            status=status.HTTP_403_FORBIDDEN,
        )

    otp = OTP.objects.filter(phone=phone, code=code, is_used=False).order_by("-created_at").first()
    if not otp or not otp.is_valid(settings.OTP_TTL_SECONDS):
        return Response({"detail": "Invalid or expired OTP"}, status=status.HTTP_400_BAD_REQUEST)
    otp.is_used = True
    otp.save(update_fields=["is_used"])

    refresh = RefreshToken.for_user(user)
    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
        "new_user": False,
    })


@api_view(["GET"])
def me(request):
    return Response(UserSerializer(request.user).data)


# ===========================================================================
# Master data + Users + Companies + Contacts
# ===========================================================================
class MasterDataViewSet(viewsets.ModelViewSet):
    queryset = MasterData.objects.filter(is_active=True)
    serializer_class = MasterDataSerializer
    search_fields = ["value", "label"]

    def get_queryset(self):
        qs = super().get_queryset()
        cat = self.request.query_params.get("category")
        return qs.filter(category=cat) if cat else qs


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    search_fields = ["name", "phone", "email"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        user = serializer.save()
        emit_user_created(user)

    def perform_update(self, serializer):
        user = serializer.save()
        emit_user_updated(user)

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        # Guard against self-deletion: an admin removing their own account would
        # lock themselves out mid-session, and it's the only account guaranteed
        # to still be an admin — so this also keeps at least one admin around.
        if user.id == request.user.id:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Safe hard delete: every ownership FK (enquiry.owner, meeting.consultant,
        # touchpoint/round/follow-up created_by) is SET_NULL, so their work is
        # preserved (just unassigned); only the user's own notifications cascade.
        user_id = user.id
        user.delete()
        emit_user_deleted(user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CompanyViewSet(viewsets.ModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    search_fields = ["name", "gstin", "city", "industry"]

    def get_queryset(self):
        qs = super().get_queryset()
        ind = self.request.query_params.get("industry")
        return qs.filter(industry=ind) if ind else qs


class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.select_related("company").all()
    serializer_class = ContactSerializer
    search_fields = ["name", "phone", "email", "company__name"]

    def get_queryset(self):
        qs = super().get_queryset()
        company = self.request.query_params.get("company")
        return qs.filter(company_id=company) if company else qs


# ===========================================================================
# Enquiries + nested flows
# ===========================================================================
# Deal-size bands for `?value_band=`, as (min_inclusive, max_exclusive) rupees.
# Mirrors VALUE_BANDS in web/src/lib/utils/valueBand.ts — the frontend owns the
# labels, this owns the filtering, and the ids are the wire contract between
# them. Edit both together, exactly as leadType.ts / derived_type are kept in
# step.
#
# Segments of three lakhs that SHARE their boundary up to ₹15 L, then wider
# steps above it: "3-6" is 3,00,000 <= x < 6,00,000, so ₹3 L exactly is "3-6"
# and ₹3.5 L is "3-6" too. Sharing the edge is the point — 1-3 / 4-6 style
# cut-offs leave ₹3.5 L in a hole that matches no band. Never leave a gap.
#
# Three-lakh steps all the way to 50 gave 18 bands, which is an unusable
# picker; above ₹15 L the deals are sparse enough that a wider band says as
# much. There is deliberately no band below ₹1 L: deals do not go under a lakh.
VALUE_BANDS = {
    "1-3": (100000, 300000),
    "3-6": (300000, 600000),
    "6-9": (600000, 900000),
    "9-12": (900000, 1200000),
    "12-15": (1200000, 1500000),
    "15-20": (1500000, 2000000),
    "20-30": (2000000, 3000000),
    "30-50": (3000000, 5000000),
    "50+": (5000000, None),
}


class EnquiryViewSet(viewsets.ModelViewSet):
    queryset = Enquiry.objects.select_related("company", "owner", "contact").all()
    search_fields = ["lead_id", "company__name", "phone", "email", "contact__name", "source", "industry"]
    ordering_fields = [
        "created_at", "updated_at", "expected_value", "expected_close_date",
        "company__name", "contact__name", "source", "enquiry_type", "status",
    ]

    def get_serializer_class(self):
        return EnquiryDetailSerializer if self.action in ("retrieve", "create", "update", "partial_update") else EnquiryListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        # Consultants see only their own; admins see everything
        user = self.request.user
        if user.is_authenticated and user.role == "consultant":
            qs = qs.filter(owner=user)
        for f in ("status", "source", "industry", "enquiry_type"):
            if p.get(f):
                qs = qs.filter(**{f: p.get(f)})
        if p.get("owner"):
            qs = qs.filter(owner_id=p.get("owner"))
        # Date filter — created_at, calendar-day inclusive on both ends
        # (matches the Enquiry ID column, which sorts by created_at).
        if p.get("date_from"):
            qs = qs.filter(created_at__date__gte=p.get("date_from"))
        if p.get("date_to"):
            qs = qs.filter(created_at__date__lte=p.get("date_to"))
        # Derived type — computed from expected_close_date, NOT the stored
        # enquiry_type column. Bands mirror web/src/lib/utils/leadType.ts:
        #   Hot  : closes within HOT_DAYS (incl. overdue)
        #   Warm : HOT_DAYS+1 .. WARM_DAYS
        #   Cold : later than WARM_DAYS, or no close date at all
        dt = p.get("derived_type")
        if dt in ("Hot", "Warm", "Cold"):
            today = timezone.localdate()
            hot_edge = today + timezone.timedelta(days=Enquiry.HOT_DAYS)
            warm_edge = today + timezone.timedelta(days=Enquiry.WARM_DAYS)
            if dt == "Hot":
                qs = qs.filter(expected_close_date__lte=hot_edge,
                               expected_close_date__isnull=False)
            elif dt == "Warm":
                qs = qs.filter(expected_close_date__gt=hot_edge,
                               expected_close_date__lte=warm_edge)
            else:  # Cold
                qs = qs.filter(
                    Q(expected_close_date__gt=warm_edge)
                    | Q(expected_close_date__isnull=True)
                )
        # Deal-size band — derived from expected_value, never stored, so the
        # column stays numeric and the dashboard can keep Sum()ing it. Filtered
        # here (not client-side) because the list is paginated: filtering one
        # page would silently hide matches on every other page.
        # Bands mirror web/src/lib/utils/valueBand.ts — edit both together.
        band = VALUE_BANDS.get(p.get("value_band"))
        if band:
            lo, hi = band
            # `__gt=0` matters for the "under ₹1 L" band: expected_value
            # defaults to 0, so without it that band would sweep in every
            # enquiry where no figure was ever entered. bandFor() on the
            # frontend likewise treats 0 as "no value" and renders a dash —
            # "nothing entered" is not the same as "a small deal". A no-op for
            # every other band, whose floor is already >= 1,00,000.
            qs = qs.filter(expected_value__gt=0, expected_value__gte=lo)
            if hi is not None:
                qs = qs.filter(expected_value__lt=hi)
        # Dashboard side-panel slices — server-computed so they cover the
        # whole dataset instead of whatever page the client happened to load.
        open_statuses = ["New", "In Progress"]
        if p.get("stalled"):
            # Open deals untouched for STALE_DAYS+, stalest first.
            cutoff = timezone.now() - timezone.timedelta(days=Enquiry.STALE_DAYS)
            qs = qs.filter(status__in=open_statuses, updated_at__lt=cutoff)
            qs = qs.order_by("updated_at")
        if p.get("queue") == "mine":
            # The caller's own open deals that have a follow-up scheduled —
            # overdue ones first, then soonest upcoming. The follow-up date is
            # the next_action_date of the most recent touchpoint that set one
            # (a later touchpoint supersedes an earlier one), logged from the
            # "Follow-up date" field on Log Touchpoint. No upper horizon, so a
            # follow-up set any time in the future still shows up here.
            latest_followup = Touchpoint.objects.filter(
                enquiry=OuterRef("pk"), next_action_date__isnull=False,
            ).order_by("-created_at").values("next_action_date")[:1]
            qs = qs.filter(owner=user, status__in=open_statuses).annotate(
                followup_date=Subquery(latest_followup),
            ).filter(
                followup_date__isnull=False,
            ).order_by("followup_date")
        return qs

    def perform_create(self, serializer):
        owner = serializer.validated_data.get("owner") or self.request.user
        enq = serializer.save(owner=owner)
        # Open every timeline with the moment the lead came in. Done here, in
        # the one place all clients create through, so the web console and the
        # mobile app both get it without either having to remember — and so
        # neither can write a second one and double up.
        Touchpoint.objects.create(
            enquiry=enq,
            channel="Created",
            note=(
                f"Lead created from {enq.source}." if enq.source else "Lead created."
            ),
            created_by=self.request.user,
        )
        notif = Notification.objects.create(
            audience="admin", ntype="new_enquiry",
            title="New enquiry created",
            subtitle=f"{enq.company.name} · {enq.lead_id}",
            link_type="enquiry", link_id=str(enq.id),
        )
        emit_notification(notif)
        emit_enquiry_event(enq, "created")

    # ---- Log a touchpoint ----
    @action(detail=True, methods=["post"])
    def log_touchpoint(self, request, pk=None):
        enq = self.get_object()
        ser = TouchpointSerializer(data={**request.data, "enquiry": enq.id})
        ser.is_valid(raise_exception=True)
        tp = ser.save(created_by=request.user, enquiry=enq)
        # Phase 7 hook: if the touchpoint carries a `next_action_date`, drop a
        # matching FollowUp so the consultant's queue picks it up automatically.
        if tp.next_action_date:
            noon = timezone.now().replace(
                year=tp.next_action_date.year,
                month=tp.next_action_date.month,
                day=tp.next_action_date.day,
                hour=10, minute=0, second=0, microsecond=0,
            )
            FollowUp.objects.create(
                enquiry=enq,
                owner=enq.owner or request.user,
                title=tp.next_action or f"Follow up — {enq.company.name}",
                notes=tp.note,
                due_at=noon,
                source_touchpoint=tp,
                created_by=request.user,
            )
        emit_enquiry_action(enq, "touchpoint:created", {"touchpoint": ser.data})
        return Response(ser.data, status=status.HTTP_201_CREATED)

    # ---- Change status ----
    @action(detail=True, methods=["post"])
    def change_status(self, request, pk=None):
        enq = self.get_object()
        new_status = request.data.get("status")
        valid = dict(Enquiry.STATUS_CHOICES)
        if new_status not in valid:
            return Response({"detail": "Invalid status"}, status=400)
        old = enq.status
        enq.status = new_status
        updates = ["status", "updated_at"]
        # When flipping to Lost, capture the loss reason if the caller sent one.
        if new_status == "Lost":
            lost_reason = request.data.get("lost_reason", "")
            valid_reasons = dict(Enquiry.LOST_REASON_CHOICES)
            if lost_reason and lost_reason not in valid_reasons:
                return Response({"detail": "Invalid lost_reason"}, status=400)
            enq.lost_reason = lost_reason or enq.lost_reason
            updates.append("lost_reason")
        elif old == "Lost" and new_status != "Lost":
            # Reversing a Lost decision clears the reason so the Why-we-lose
            # card doesn't count a resurrected deal.
            enq.lost_reason = ""
            updates.append("lost_reason")
        enq.save(update_fields=updates)
        notif = Notification.objects.create(
            audience="admin", ntype="status_changed",
            title="Status changed",
            subtitle=f"{enq.company.name} · {old} → {new_status}",
            link_type="enquiry", link_id=str(enq.id),
        )
        emit_notification(notif)
        if new_status == "Won":
            won_notif = Notification.objects.create(
                audience="admin", ntype="deal_won",
                title="Deal won",
                subtitle=f"{enq.company.name} · ₹{enq.expected_value:,.0f}",
                link_type="enquiry", link_id=str(enq.id),
            )
            emit_notification(won_notif)
        emit_enquiry_event(enq, "status_changed")
        detail = EnquiryDetailSerializer(enq).data
        emit_enquiry_action(enq, "enquiry:status_changed", {
            "status": enq.status,
            "lost_reason": enq.lost_reason,
            "enquiry": detail,
        })
        return Response(detail)

    # ---- Log a negotiation round ----
    @action(detail=True, methods=["post"])
    def log_round(self, request, pk=None):
        enq = self.get_object()
        ser = NegotiationRoundSerializer(data={**request.data, "enquiry": enq.id})
        ser.is_valid(raise_exception=True)
        ser.save(created_by=request.user, enquiry=enq)
        emit_enquiry_action(enq, "enquiry:round_logged", {"negotiation_round": ser.data})
        return Response(ser.data, status=status.HTTP_201_CREATED)

    # ---- Reassign to another consultant, or unassign (admin only) ----
    @action(detail=True, methods=["post"], permission_classes=[IsAdminRole])
    def reassign(self, request, pk=None):
        enq = self.get_object()
        owner_id = request.data.get("owner")
        # A missing/null/blank owner means "unassign" — the field is
        # nullable on the model, this just wasn't a reachable request shape
        # before (every caller previously always sent a real user id).
        if owner_id in (None, "", "null"):
            enq.owner = None
        else:
            try:
                enq.owner = User.objects.get(pk=owner_id)
            except User.DoesNotExist:
                return Response({"detail": "User not found"}, status=404)
        enq.save(update_fields=["owner", "updated_at"])
        emit_enquiry_event(enq, "reassigned")
        return Response(EnquiryListSerializer(enq).data)


class MeetingViewSet(viewsets.ModelViewSet):
    queryset = Meeting.objects.select_related("company", "consultant").all()
    serializer_class = MeetingSerializer
    search_fields = ["company__name", "purpose"]
    ordering_fields = ["scheduled_at", "status", "created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and user.role == "consultant":
            qs = qs.filter(consultant=user)
        p = self.request.query_params
        when = p.get("when")  # upcoming / past
        now = timezone.now()
        if when == "upcoming":
            qs = qs.filter(scheduled_at__gte=now)
        elif when == "past":
            qs = qs.filter(scheduled_at__lt=now)
        # Exact-match filters — Phase 6 gives the mobile app finer slicing.
        for field in ("status", "mode"):
            v = p.get(field)
            if v:
                qs = qs.filter(**{field: v})
        if p.get("consultant"):
            qs = qs.filter(consultant_id=p.get("consultant"))
        if p.get("enquiry"):
            qs = qs.filter(enquiry_id=p.get("enquiry"))
        # Date-range filters — accept ISO strings; silently ignore malformed.
        for key, lookup in (("date_from", "scheduled_at__gte"), ("date_to", "scheduled_at__lte")):
            v = p.get(key)
            if v:
                qs = qs.filter(**{lookup: v})
        return qs

    def perform_create(self, serializer):
        m = serializer.save()
        self._queue_notifications(m)
        # `enquiry` is optional on Meeting (a meeting can be booked straight
        # against a company with no linked enquiry) — nothing to push to if
        # it wasn't set.
        if m.enquiry_id:
            emit_enquiry_action(m.enquiry, "meeting:created", {"meeting": MeetingSerializer(m).data})

    def perform_update(self, serializer):
        old = self.get_object()
        m = serializer.save()
        # If a meeting just flipped to Done, drop a team-visible notification
        # so admins see outcome activity roll in.
        if old.status != "Done" and m.status == "Done":
            sentiment = m.outcome_sentiment or "logged"
            notif = Notification.objects.create(
                audience="admin", ntype="team_update",
                title="Meeting outcome logged",
                subtitle=f"{m.company.name} · {m.purpose} — {sentiment}",
                link_type="meeting", link_id=str(m.id),
            )
            emit_notification(notif)
        # Any plain PATCH/PUT (outcome logging, edits) — same "something in
        # this meeting changed" push the dedicated reschedule action sends,
        # so a Done/edited meeting shows up live everywhere reschedule does.
        if m.enquiry_id:
            emit_enquiry_action(m.enquiry, "meeting:updated", {"meeting": MeetingSerializer(m).data})

    @staticmethod
    def _queue_notifications(m):
        """Route through the pluggable NotificationService — no-op today,
        real provider later, no caller change required either way."""
        service = get_notification_service()
        if m.notify_email and m.email_body:
            service.send_email(to_label=m.company.name, subject=m.email_subject, body=m.email_body)
        if m.notify_whatsapp and m.whatsapp_message:
            service.send_whatsapp(to_label=m.company.name, body=m.whatsapp_message)

    @action(detail=True, methods=["post"])
    def reschedule(self, request, pk=None):
        m = self.get_object()
        new_scheduled = request.data.get("scheduled_at")
        if new_scheduled:
            # Parse into a real aware datetime instead of assigning the raw
            # string straight onto the model attribute — a bare string
            # assignment skips DRF's DateTimeField entirely, so `.save()`
            # stores it fine but the in-memory `m` still holds that exact
            # string. Serializing it right back out (below) then just echoes
            # whatever timezone format the caller happened to send (a bare
            # "Z"-suffixed UTC string from JS's toISOString(), or a naive
            # string with no offset at all from Flutter's toIso8601String())
            # instead of the consistent, localized format every other
            # meeting field gets — the value is still correct, but any
            # client doing anything less than a full ISO-8601 parse on read
            # (e.g. a naive substring split) reads the wrong wall-clock time.
            parsed = parse_datetime(new_scheduled)
            if parsed:
                m.scheduled_at = timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
        m.status = "Scheduled"
        update_fields = ["scheduled_at", "status"]
        # Everything else the Reschedule modal composes — saved for real now,
        # not silently discarded. Only touches a field if the caller sent it,
        # so a bare {"scheduled_at": ...} call still works exactly as before.
        for key in ("mode", "reschedule_reason", "notify_email", "notify_whatsapp",
                    "email_subject", "email_body", "whatsapp_message"):
            if key in request.data:
                setattr(m, key, request.data[key])
                update_fields.append(key)
        m.save(update_fields=update_fields)
        self._queue_notifications(m)
        payload = MeetingSerializer(m).data
        if m.enquiry_id:
            emit_enquiry_action(m.enquiry, "meeting:updated", {"meeting": payload})
        return Response(payload)


class FollowUpViewSet(viewsets.ModelViewSet):
    """Phase 7 — Follow-ups.

    Filter params (mobile-friendly slicing):
      · `owner=<id>` — my queue vs someone else's.
      · `status=Pending|Done|Snoozed|Cancelled`
      · `enquiry=<id>` — follow-ups against a single enquiry.
      · `due=today` — narrow to today's calendar day (in server TZ).
      · `due=overdue` — Pending follow-ups whose `due_at` is already past.
    Consultants are scoped to their own follow-ups automatically.
    """

    queryset = FollowUp.objects.select_related("enquiry", "enquiry__company", "owner").all()
    serializer_class = FollowUpSerializer
    search_fields = ["title", "enquiry__lead_id", "enquiry__company__name"]
    ordering_fields = ["due_at", "created_at", "status"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and user.role == "consultant":
            qs = qs.filter(owner=user)
        p = self.request.query_params
        for field in ("status",):
            if p.get(field):
                qs = qs.filter(**{field: p.get(field)})
        if p.get("owner"):
            qs = qs.filter(owner_id=p.get("owner"))
        if p.get("enquiry"):
            qs = qs.filter(enquiry_id=p.get("enquiry"))
        due = p.get("due")
        now = timezone.now()
        if due == "overdue":
            qs = qs.filter(status="Pending", due_at__lt=now)
        elif due == "today":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timezone.timedelta(days=1)
            qs = qs.filter(due_at__gte=start, due_at__lt=end)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        f = self.get_object()
        f.status = "Done"
        f.completed_at = timezone.now()
        f.save(update_fields=["status", "completed_at", "updated_at"])
        return Response(FollowUpSerializer(f).data)

    @action(detail=True, methods=["post"])
    def snooze(self, request, pk=None):
        """Push a follow-up out to `until` (ISO datetime). Requires a value."""
        f = self.get_object()
        until = request.data.get("until")
        if not until:
            return Response({"detail": "`until` is required."}, status=400)
        f.due_at = until
        f.status = "Snoozed"
        f.save(update_fields=["due_at", "status", "updated_at"])
        return Response(FollowUpSerializer(f).data)


class ProposalViewSet(viewsets.ModelViewSet):
    queryset = Proposal.objects.select_related("enquiry").all()
    serializer_class = ProposalSerializer
    search_fields = ["title", "enquiry__lead_id"]
    # Accept multipart so `Upload Proposal` can post the PDF alongside the
    # title / amount / status fields.
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def initial(self, request, *args, **kwargs):
        """Refuse every action while the feature is hidden.

        404 rather than 403: "this endpoint isn't here" is the truth we want a
        client to act on. 403 reads as "you lack permission", which would send
        someone hunting through roles for a switch that isn't about them.

        In initial() so it covers list/retrieve/create/update/destroy at once —
        one gate, with no way to add an action later that forgets to check.
        The rows stay in the database; only the door is shut.
        """
        if not settings.PROPOSALS_ENABLED:
            raise Http404("Proposals are not available.")
        return super().initial(request, *args, **kwargs)

    def perform_create(self, serializer):
        p = serializer.save()
        emit_enquiry_action(p.enquiry, "proposal:created", {"proposal": ProposalSerializer(p).data})


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Notification.objects.filter(
            Q(recipient=user) | Q(recipient__isnull=True)
        )
        # Role-aware feed: admins see admin+all, consultants see consultant+all
        if user.role == "admin":
            qs = qs.filter(Q(audience="admin") | Q(audience="all"))
        else:
            qs = qs.filter(Q(audience="consultant") | Q(audience="all"))
        return qs

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        self.get_queryset().update(is_read=True)
        return Response({"detail": "All marked read"})


# ===========================================================================
# Dashboard stats
# ===========================================================================
def _period_start(period: str):
    """Start datetime for a dashboard period key, or None for all-time.

    Buckets: today · week (last 7 days) · month (calendar month) ·
    quarter (calendar quarter) · ytd (calendar year). Unknown values
    fall through to all-time so old clients keep working.
    """
    now = timezone.localtime()
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "today":
        return midnight
    if period == "week":
        return midnight - timezone.timedelta(days=7)
    if period == "month":
        return midnight.replace(day=1)
    if period == "quarter":
        q_month = ((now.month - 1) // 3) * 3 + 1
        return midnight.replace(month=q_month, day=1)
    if period == "ytd":
        return midnight.replace(month=1, day=1)
    return None


@api_view(["GET"])
def dashboard(request):
    user = request.user
    qs = Enquiry.objects.all()
    if user.role == "consultant":
        qs = qs.filter(owner=user)

    # ?period= narrows every aggregate to enquiries CREATED in the window.
    # One consistent gate keeps ratios sane (won ⊆ total, so conversion
    # can never exceed 100%). We don't track status-change timestamps, so
    # "won this month" here means "created this month and already won".
    start = _period_start(request.query_params.get("period", ""))
    created_qs = qs.filter(created_at__gte=start) if start else qs

    by_stage = list(created_qs.values("status").annotate(count=Count("id")).order_by())
    open_statuses = ["New", "In Progress"]
    won = created_qs.filter(status="Won")
    pipeline_value = created_qs.filter(status__in=open_statuses).aggregate(v=Sum("expected_value"))["v"] or 0

    # Win rate — drives the Forecast KPI, which used to be a hardcoded
    # "pipeline x 60%" with no basis in the data.
    #
    # Denominator is RESOLVED deals only (Won + Lost). Won/total would count
    # every still-open deal as a failure, which is what made the Conversion
    # tile read 24% while the team actually closes ~74% of what it resolves.
    # Spam is excluded on purpose: it was never a real enquiry, so counting it
    # as a loss would understate the rate.
    #
    # Deliberately NOT period-scoped (uses `qs`, not `created_qs`): a win rate
    # is a property of the team's history, and slicing it to "Today" would
    # compute it from a handful of deals — or none — and swing the forecast
    # wildly. It stays role-scoped, so a consultant still sees their own rate.
    won_resolved = qs.filter(status="Won").count()
    lost_resolved = qs.filter(status="Lost").count()
    resolved_count = won_resolved + lost_resolved
    # None, not 0.0, when nothing has resolved yet: "no evidence" is not "we
    # never win". The client renders a dash rather than a fabricated ₹0.
    win_rate = (won_resolved / resolved_count) if resolved_count else None

    data = {
        "total_enquiries": created_qs.count(),
        "open_enquiries": created_qs.filter(status__in=open_statuses).count(),
        "won_count": won.count(),
        "won_value": won.aggregate(v=Sum("expected_value"))["v"] or 0,
        "pipeline_value": pipeline_value,
        # Forecast inputs. won_resolved/resolved_count ship alongside the rate
        # so the UI can show the sample it came from — 74% off 23 deals is a
        # very different claim from 74% off 2,300.
        "win_rate": win_rate,
        "won_resolved": won_resolved,
        "resolved_count": resolved_count,
        "by_stage": by_stage,
        # Only Scheduled counts as "coming". Filtering on the date alone also
        # counted a meeting that had already been marked Done (or Cancelled)
        # but whose slot was still later today — so the dashboard read one
        # higher than the Meetings page, which has always required Scheduled.
        "upcoming_meetings": Meeting.objects.filter(
            scheduled_at__gte=timezone.now(),
            status="Scheduled",
            **({"consultant": user} if user.role == "consultant" else {}),
        ).count(),
    }
    if user.role == "admin":
        data["by_consultant"] = list(
            created_qs.values("owner__name").annotate(count=Count("id")).order_by("-count")
        )
        data["unassigned"] = created_qs.filter(owner__isnull=True).count()

    # Why-we-lose card feeds off real reasons on Lost enquiries. Every
    # authenticated user sees their own scoped counts (consultants see only
    # their Lost deals; admins see the team's).
    lost = created_qs.filter(status="Lost").exclude(lost_reason="")
    data["by_lost_reason"] = list(
        lost.values("lost_reason").annotate(count=Count("id")).order_by("-count")
    )
    return Response(data)
