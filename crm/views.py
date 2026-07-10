from django.conf import settings
from django.db.models import Count, Sum, Q
from django.utils import timezone
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
from .sockets import emit_notification, emit_enquiry_event, emit_enquiry_action, emit_user_created
from .notifications import get_notification_service


# ===========================================================================
# Auth: phone -> OTP -> JWT  (matches both the web and mobile logins)
# ===========================================================================
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def request_otp(request):
    ser = RequestOTPSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    phone = ser.validated_data["phone"].strip()
    otp = OTP.issue(phone)
    # In production, send via SMS gateway here. For demo we optionally return it.
    payload = {"detail": "OTP sent", "phone": phone}
    if settings.OTP_RETURN_IN_RESPONSE:
        payload["otp"] = otp.code  # DEV ONLY
    return Response(payload)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def verify_otp(request):
    ser = VerifyOTPSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    phone = ser.validated_data["phone"].strip()
    code = ser.validated_data["code"].strip()
    role = ser.validated_data.get("role", "consultant")

    otp = OTP.objects.filter(phone=phone, code=code, is_used=False).order_by("-created_at").first()
    if not otp or not otp.is_valid(settings.OTP_TTL_SECONDS):
        return Response({"detail": "Invalid or expired OTP"}, status=status.HTTP_400_BAD_REQUEST)
    otp.is_used = True
    otp.save(update_fields=["is_used"])

    user, created = User.objects.get_or_create(
        phone=phone,
        defaults={"name": "New User", "role": role},
    )
    if created:
        emit_user_created(user)
    refresh = RefreshToken.for_user(user)
    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
        "new_user": created,
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
        # Dashboard side-panel slices — server-computed so they cover the
        # whole dataset instead of whatever page the client happened to load.
        open_statuses = [
            "Enquiry", "Qualified", "Meeting Scheduled",
            "Meeting Done", "Proposal Sent", "Negotiation",
        ]
        if p.get("stalled"):
            # Open deals untouched for STALE_DAYS+, stalest first.
            cutoff = timezone.now() - timezone.timedelta(days=Enquiry.STALE_DAYS)
            qs = qs.filter(status__in=open_statuses, updated_at__lt=cutoff)
            qs = qs.order_by("updated_at")
        if p.get("queue") == "mine":
            # The caller's own open deals closing within a week, soonest first.
            horizon = timezone.localdate() + timezone.timedelta(days=7)
            qs = qs.filter(
                owner=user,
                status__in=open_statuses,
                expected_close_date__isnull=False,
                expected_close_date__lte=horizon,
            ).order_by("expected_close_date")
        return qs

    def perform_create(self, serializer):
        owner = serializer.validated_data.get("owner") or self.request.user
        enq = serializer.save(owner=owner)
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
            Notification.objects.create(
                audience="admin", ntype="team_update",
                title="Meeting outcome logged",
                subtitle=f"{m.company.name} · {m.purpose} — {sentiment}",
                link_type="meeting", link_id=str(m.id),
            )

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
        m.scheduled_at = request.data.get("scheduled_at", m.scheduled_at)
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
    open_statuses = ["Enquiry", "Qualified", "Meeting Scheduled", "Proposal Sent", "Negotiation"]
    won = created_qs.filter(status="Won")
    pipeline_value = created_qs.filter(status__in=open_statuses).aggregate(v=Sum("expected_value"))["v"] or 0

    data = {
        "total_enquiries": created_qs.count(),
        "open_enquiries": created_qs.filter(status__in=open_statuses).count(),
        "won_count": won.count(),
        "won_value": won.aggregate(v=Sum("expected_value"))["v"] or 0,
        "pipeline_value": pipeline_value,
        "by_stage": by_stage,
        "upcoming_meetings": Meeting.objects.filter(
            scheduled_at__gte=timezone.now(),
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
