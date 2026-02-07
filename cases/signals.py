from django.db.models.signals import post_save
from django.dispatch import receiver

from evidence.models import Evidence
from .models import CaseLog, Notification


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
    if board and board.detective_id:
        Notification.objects.create(
            recipient=board.detective,
            case=instance.case,
            evidence=instance,
            message=f"New evidence added to case #{instance.case_id}.",
        )
