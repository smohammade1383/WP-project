from __future__ import annotations

from typing import Iterable

from django.contrib.auth import get_user_model
from django.db.models import Q, QuerySet

from .models import Notification

User = get_user_model()


def _normalize_user_ids(users: QuerySet | Iterable | None) -> set[int]:
    if users is None:
        return set()
    if isinstance(users, QuerySet):
        return set(users.values_list("id", flat=True))

    normalized: set[int] = set()
    for user in users:
        user_id = getattr(user, "id", None)
        if user_id:
            normalized.add(int(user_id))
    return normalized


def users_for_roles(*role_names: str) -> QuerySet:
    roles = [role for role in role_names if role]
    if not roles:
        return User.objects.none()

    query = User.objects.filter(is_active=True, groups__name__in=roles)
    if "Administrator" in roles:
        query = User.objects.filter(is_active=True).filter(
            Q(is_superuser=True) | Q(groups__name__in=roles)
        )
    return query.distinct()


def notify_users(
    users: QuerySet | Iterable | None,
    *,
    message: str,
    case=None,
    evidence=None,
    exclude_user_ids: Iterable[int] | None = None,
) -> int:
    if not message or not message.strip():
        return 0

    recipient_ids = _normalize_user_ids(users)
    if exclude_user_ids:
        recipient_ids -= {int(user_id) for user_id in exclude_user_ids if user_id}
    if not recipient_ids:
        return 0

    notifications = [
        Notification(
            recipient_id=recipient_id,
            case=case,
            evidence=evidence,
            message=message.strip(),
        )
        for recipient_id in recipient_ids
    ]
    Notification.objects.bulk_create(notifications)
    return len(notifications)


def notify_roles(
    role_names: Iterable[str],
    *,
    message: str,
    case=None,
    evidence=None,
    exclude_user_ids: Iterable[int] | None = None,
) -> int:
    return notify_users(
        users_for_roles(*list(role_names)),
        message=message,
        case=case,
        evidence=evidence,
        exclude_user_ids=exclude_user_ids,
    )
