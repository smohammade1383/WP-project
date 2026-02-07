from django.conf import settings
from django.db import models


class CitizenTip(models.Model):
    class Status(models.TextChoices):
        OFFICER_REVIEW = "officer_review", "Officer Review"
        DETECTIVE_REVIEW = "detective_review", "Detective Review"
        APPROVED = "approved", "Approved"

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
    created_at = models.DateTimeField(auto_now_add=True)
