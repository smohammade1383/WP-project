import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone


class CitizenTip(models.Model):
    class Status(models.TextChoices):
        OFFICER_REVIEW = "officer_review", "Officer Review"
        DETECTIVE_REVIEW = "detective_review", "Detective Review"
        USEFUL = "useful", "Useful"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="citizen_tips")
    case = models.ForeignKey("cases.Case", on_delete=models.SET_NULL, null=True, blank=True)
    suspect_profile = models.ForeignKey(
        "cases.SuspectCaseProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="citizen_tips",
    )
    description = models.TextField()
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.OFFICER_REVIEW)
    officer_reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="officer_tips_reviewed",
    )
    detective_reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="detective_tips_reviewed",
    )
    linked_evidence = models.ForeignKey(
        "evidence.Evidence",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="citizen_tip_links",
    )
    unique_tracking_code = models.CharField(max_length=24, unique=True, null=True, blank=True)
    reward_amount = models.BigIntegerField(default=0)
    useful_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.status == self.Status.USEFUL:
            if not self.unique_tracking_code:
                # Extremely low collision chance; loop for safety.
                while True:
                    candidate = secrets.token_hex(8).upper()
                    if not CitizenTip.objects.filter(unique_tracking_code=candidate).exists():
                        self.unique_tracking_code = candidate
                        break
            if self.suspect_profile_id:
                self.reward_amount = self.suspect_profile.reward_amount
            if self.useful_at is None:
                self.useful_at = timezone.now()
        super().save(*args, **kwargs)
