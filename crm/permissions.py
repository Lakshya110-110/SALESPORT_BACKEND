from rest_framework import permissions


class IsAdminRole(permissions.BasePermission):
    """Allow only users with the admin role."""
    message = "Admin role required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "admin")


#: Roles allowed into the web console. Everything EXCEPT consultant — they are
#: field staff and the mobile app is their tool. Kept as a set here, not spelled
#: out at each call site, so "who may use the console" has exactly one answer
#: and a new role can't quietly inherit access by being forgotten.
#:
#: Mirrored in web/src/lib/auth/console.ts — edit both together.
CONSOLE_ROLES = frozenset({"admin", "manager", "founder", "sales_head"})


class IsConsoleUser(permissions.BasePermission):
    """Allow anyone whose role belongs in the web console; refuse consultants.

    This is the real gate. The browser already shows consultants a polite "no
    web console access" message, but that runs AFTER verify-otp has handed them
    a valid JWT — the UI simply declines to store it. Anyone with curl and their
    own OTP walked straight past it and could read the whole user list, phone
    numbers included, and the team-wide dashboard.

    Deliberately NOT applied to verify-otp: consultants must still be able to
    log in, because that same endpoint serves the Android app. They keep their
    token and their own enquiries/meetings/touchpoints (already scoped to them
    in get_queryset). What they lose is the console's team-wide surface.
    """

    message = "This account doesn't have web console access."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in CONSOLE_ROLES)
