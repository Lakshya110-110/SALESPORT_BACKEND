from rest_framework import permissions


class IsAdminRole(permissions.BasePermission):
    """Allow only users with the admin role."""
    message = "Admin role required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "admin")
