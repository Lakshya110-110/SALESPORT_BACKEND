"""
Socket.IO server — realtime push for notifications and live enquiry/dashboard
updates. Runs as an `AsyncServer` combined into the Django ASGI app (see
asgi.py); Redis (Memurai locally, ElastiCache in prod) backs cross-worker
pub/sub via `AsyncRedisManager`, so `emit()` reaches a connected client
regardless of which worker process holds their actual socket.

Room design mirrors the exact same visibility rules the REST API already
enforces (NotificationViewSet.get_queryset, EnquiryViewSet.get_queryset),
so a push never shows a user something they couldn't already see by
refetching:
  - every connection joins `user:{id}` — for recipient-scoped notifications
    and "your enquiry changed" pushes to its specific owner.
  - every connection also joins `role:admin` or `role:consultant` — for
    audience-scoped notifications and admin's "sees every enquiry" feed.

Existing views are all synchronous DRF. `emit_*` helpers below wrap the
async `emit()` with `async_to_sync` so call sites in sync view code don't
need to change — see change_status/reassign/perform_create in views.py.
"""
import json

import socketio
from asgiref.sync import async_to_sync, sync_to_async
from django.conf import settings
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    client_manager=socketio.AsyncRedisManager(settings.REDIS_URL) if settings.USE_REDIS else None,
)


def _user_room(user_id: int) -> str:
    return f"user:{user_id}"


def _role_room(role: str) -> str:
    return f"role:{role}"


def _enquiry_room(enquiry_id: int) -> str:
    return f"enquiry:{enquiry_id}"


@sio.event
async def connect(sid, environ, auth):
    from .models import User  # deferred: avoid import before Django apps are ready

    token = (auth or {}).get("token")
    if not token:
        return False
    try:
        access = AccessToken(token)
    except TokenError:
        return False
    user_id = access["user_id"]
    try:
        user = await sync_to_async(User.objects.get)(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return False
    await sio.save_session(sid, {"user_id": user.id, "role": user.role})
    await sio.enter_room(sid, _user_room(user.id))
    await sio.enter_room(sid, _role_room(user.role))
    return True


@sio.event
async def join_enquiry(sid, data):
    """A client viewing an enquiry's detail page joins this room so it gets
    the fine-grained `touchpoint:created` / `enquiry:status_changed` /
    `meeting:created` / `meeting:updated` / `enquiry:round_logged` /
    `proposal:created` pushes (see emit_enquiry_action) without waiting on
    the coarser role/owner rooms. Same visibility rule as the REST API's
    EnquiryViewSet.get_queryset: admins may join any enquiry, consultants
    only their own — otherwise a stray enquiry_id could be used to snoop on
    another consultant's deal."""
    from .models import Enquiry  # deferred: avoid import before Django apps are ready

    enquiry_id = (data or {}).get("enquiry_id")
    if not enquiry_id:
        return
    session = await sio.get_session(sid)
    if session["role"] != "admin":
        owns_it = await sync_to_async(
            Enquiry.objects.filter(pk=enquiry_id, owner_id=session["user_id"]).exists
        )()
        if not owns_it:
            return
    await sio.enter_room(sid, _enquiry_room(enquiry_id))


@sio.event
async def leave_enquiry(sid, data):
    enquiry_id = (data or {}).get("enquiry_id")
    if enquiry_id:
        await sio.leave_room(sid, _enquiry_room(enquiry_id))


def emit_notification(notification) -> None:
    """Push one Notification instance to whoever the REST feed would show
    it to (mirrors NotificationViewSet.get_queryset's recipient/audience
    rules exactly)."""
    from .serializers import NotificationSerializer

    payload = NotificationSerializer(notification).data
    if notification.recipient_id:
        rooms = [_user_room(notification.recipient_id)]
    elif notification.audience == "all":
        rooms = [_role_room("admin"), _role_room("consultant")]
    else:
        rooms = [_role_room(notification.audience)]
    async_to_sync(sio.emit)("notification", payload, room=rooms)


def emit_enquiry_event(enquiry, event: str) -> None:
    """Push a lightweight "something changed" signal for a specific
    enquiry — admins (who see every enquiry) plus that enquiry's current
    owner (a consultant only sees their own). Deliberately minimal payload;
    the frontend refetches rather than trying to merge partial state."""
    rooms = [_role_room("admin")]
    if enquiry.owner_id:
        rooms.append(_user_room(enquiry.owner_id))
    async_to_sync(sio.emit)("enquiry_updated", {
        "enquiry_id": enquiry.id,
        "lead_id": enquiry.lead_id,
        "event": event,
    }, room=rooms)


def emit_user_created(user) -> None:
    """Push a newly-created user to the Users page — admin-only, mirrors
    emit_enquiry_event's "something changed, refetch" shape. Only admins
    manage the team roster (see UserViewSet.get_permissions), so this is
    a plain role:admin broadcast, not owner/enquiry-scoped."""
    from .serializers import UserSerializer

    async_to_sync(sio.emit)("user:created", UserSerializer(user).data, room=[_role_room("admin")])


def emit_enquiry_action(enquiry, event: str, payload: dict) -> None:
    """Push a specific, payload-carrying event for something that happened
    inside one enquiry (a new touchpoint, a status flip, a meeting created
    or rescheduled, a proposal uploaded, a negotiation round logged) —
    unlike emit_enquiry_event's deliberately-minimal signal, `payload`
    carries the actual serialized object so a client already looking at
    that enquiry can merge it straight into its cache instead of
    refetching. Targets three rooms: the enquiry's own room (anyone with
    its detail page open — see join_enquiry), its current owner, and every
    admin — never a global broadcast."""
    rooms = [_role_room("admin"), _enquiry_room(enquiry.id)]
    if enquiry.owner_id:
        rooms.append(_user_room(enquiry.owner_id))
    body = {"enquiry_id": enquiry.id, **payload}
    # `body` comes from DRF serializer `.data`, which isn't guaranteed pure-
    # JSON the way a rendered HTTP response is — DRF's own JSONRenderer
    # stringifies stray Decimal/UUID/etc. via a custom encoder, but sio.emit()
    # bypasses that renderer entirely. A plain `ReadOnlyField` (e.g.
    # NegotiationRoundSerializer.gap, which wraps a model property that
    # returns a raw Decimal) skips DecimalField's normal to-string coercion
    # and leaks straight through .data uncoerced — round-trip through
    # json.dumps/loads once here so every event gets the same "safe to emit"
    # guarantee HTTP responses already have, instead of each call site
    # having to know which nested field might not be JSON-safe.
    body = json.loads(json.dumps(body, default=str))
    async_to_sync(sio.emit)(event, body, room=rooms)
