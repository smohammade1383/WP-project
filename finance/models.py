import secrets

from django.conf import settings
from django.db import models


class RewardReport(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        OFFICER_REVIEW = "officer_review", "Officer Review"
        DETECTIVE_REVIEW = "detective_review", "Detective Review"
        REJECTED = "rejected", "Rejected"
        APPROVED = "approved", "Approved"

    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reward_reports")
    case = models.ForeignKey("cases.Case", on_delete=models.SET_NULL, null=True, blank=True)
    suspect_profile = models.ForeignKey(
        "cases.SuspectCaseProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    description = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)
    reviewed_by_officer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="officer_reward_reviews",
    )
    reviewed_by_detective = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="detective_reward_reviews",
    )
    assigned_detective = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_reward_reports",
    )
    unique_code = models.CharField(max_length=24, unique=True, null=True, blank=True)
    reward_amount = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.status == self.Status.APPROVED:
            if not self.unique_code:
                # Keep generating until we get a truly unique tracking code.
                while True:
                    candidate = secrets.token_hex(8).upper()
                    if not RewardReport.objects.filter(unique_code=candidate).exists():
                        self.unique_code = candidate
                        break
            if self.suspect_profile:
                self.reward_amount = self.suspect_profile.ranking_score * 20_000_000
            elif self.case_id:
                profiles = list(self.case.suspect_profiles.all())
                self.reward_amount = max((profile.reward_amount for profile in profiles), default=0)
        super().save(*args, **kwargs)


class PaymentTransaction(models.Model):
    class Status(models.TextChoices):
        INITIATED = "initiated", "Initiated"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"

    class TransactionType(models.TextChoices):
        BAIL = "bail", "Bail"
        FINE = "fine", "Fine"
        REWARD = "reward", "Reward"

    payer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="payment_transactions",
        null=True,
        blank=True,
    )
    case = models.ForeignKey("cases.Case", on_delete=models.SET_NULL, null=True, blank=True)
    suspect_profile = models.ForeignKey(
        "cases.SuspectCaseProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    amount = models.BigIntegerField()
    transaction_type = models.CharField(max_length=20, choices=TransactionType.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INITIATED)
    gateway_reference = models.CharField(max_length=100, blank=True)
    callback_payload = models.JSONField(default=dict, blank=True)
    return_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    @property
    def requires_gateway(self):
        return self.transaction_type != self.TransactionType.REWARD
