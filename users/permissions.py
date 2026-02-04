from rest_framework.permissions import BasePermission
from django.db.models import Q


class HasAnyRole(BasePermission):
    required_roles = ()

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        role_query = Q()
        for role_name in self.required_roles:
            role_query |= Q(name__iexact=role_name)
        return request.user.groups.filter(role_query).exists()


class IsAdministrator(HasAnyRole):
    required_roles = ("Administrator",)
