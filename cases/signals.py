from django.db.models.signals import post_save
from django.dispatch import receiver

from evidence.models import Evidence
from .models import CaseLog


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
