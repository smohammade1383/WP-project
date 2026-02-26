from django.db.models.signals import post_save
from django.dispatch import receiver

from evidence.models import Evidence
from .models import CaseLog
from .notify import notify_roles, notify_users


@receiver(post_save, sender=Evidence)
def log_new_evidence(sender, instance, created, **kwargs):
    if not created:
        return
    CaseLog.objects.create(
        case=instance.case,
        actor=instance.created_by,
        action="new_evidence",
        description=f"Evidence #{instance.id} added.",
    )
    board = getattr(instance.case, "board", None)

    recipients = [instance.case.created_by]
    if instance.case.assigned_detective_id:
        recipients.append(instance.case.assigned_detective)
    if instance.case.assigned_sergeant_id:
        recipients.append(instance.case.assigned_sergeant)
    if board and board.detective_id:
        recipients.append(board.detective)

    notify_users(
        recipients,
        case=instance.case,
        evidence=instance,
        message=f"مدرک جدید (#{instance.id}) به پرونده #{instance.case_id} اضافه شد.",
        exclude_user_ids={instance.created_by_id},
    )
    notify_roles(
        ["Police Officer", "Patrol Officer", "Cadet", "Administrator"],
        case=instance.case,
        evidence=instance,
        message=f"مدرک جدید برای پرونده #{instance.case_id} ثبت شد و در صف بررسی قرار گرفت.",
        exclude_user_ids={instance.created_by_id},
    )
