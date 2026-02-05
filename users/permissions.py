from rest_framework.permissions import BasePermission


class HasAnyRole(BasePermission):
    required_roles = ()

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(name__in=self.required_roles).exists()


class IsAdministrator(HasAnyRole):
    required_roles = ("Administrator",)
