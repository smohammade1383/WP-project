from users.permissions import HasAnyRole
from rest_framework.permissions import BasePermission


class CanViewAggregatedStats(HasAnyRole):
    required_roles = (
        "Administrator",
        "Chief",
        "Captain",
        "Sergeant",
        "Detective",
        "Police Officer",
        "Patrol Officer",
        "Cadet",
    )


class IsCoroner(HasAnyRole):
    required_roles = ("Coroner", "Administrator")


class IsAssignedDetective(BasePermission):
    message = "Only the assigned detective can modify this case."

    @staticmethod
    def _is_admin(user):
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or user.groups.filter(name="Administrator").exists())
        )

    @classmethod
    def is_assigned_detective(cls, user, case_obj):
        if cls._is_admin(user):
            return True
        if not user or not user.is_authenticated:
            return False
        if not user.groups.filter(name="Detective").exists():
            return False
        return case_obj.assigned_detective_id == user.id

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (
                self._is_admin(user)
                or user.groups.filter(name="Detective").exists()
            )
        )


class IsAssignedSergeant(BasePermission):
    message = "Only the assigned sergeant can modify this case."

    @staticmethod
    def _is_admin(user):
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or user.groups.filter(name="Administrator").exists())
        )

    @classmethod
    def is_assigned_sergeant(cls, user, case_obj):
        if cls._is_admin(user):
            return True
        if not user or not user.is_authenticated:
            return False
        if not user.groups.filter(name="Sergeant").exists():
            return False
        return case_obj.assigned_sergeant_id == user.id

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (
                self._is_admin(user)
                or user.groups.filter(name="Sergeant").exists()
            )
        )
