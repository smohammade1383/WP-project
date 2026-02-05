from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class Case(models.Model):
    class SourceType(models.TextChoices):
        COMPLAINT = "Complaint", _("Complaint")
        CRIME_SCENE = "CrimeScene", _("Crime Scene Report")

    class Status(models.TextChoices):
        DRAFT = "Draft", _("Draft")
        PENDING_CADET = "PendingCadet", _("Pending Cadet Review")
        NEEDS_COMPLAINANT_UPDATE = "NeedsComplainantUpdate", _("Needs Complainant Update")
        PENDING_OFFICER = "PendingOfficer", _("Pending Officer Review")
        OPEN = "Open", _("Open / Investigating")
        WARRANT_PENDING = "WarrantPending", _("Warrant Requested")
        IN_COURT = "InCourt", _("Sent to Court")
        CLOSED = "Closed", _("Case Closed")
        VOID = "Void", _("Void (3 Strikes)")

    class Severity(models.IntegerChoices):
        LEVEL_3 = 1, _("Level 3 (Petty)")
        LEVEL_2 = 2, _("Level 2 (Grand Theft)")
        LEVEL_1 = 3, _("Level 1 (Murder)")
        CRITICAL = 4, _("Critical (Terror/Serial)")

    title = models.CharField(max_length=200)
    description = models.TextField()
    location = models.CharField(max_length=255)

    source_type = models.CharField(
        max_length=20,
        choices=SourceType.choices,
        default=SourceType.COMPLAINT,
    )
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    severity = models.IntegerField(choices=Severity.choices, default=Severity.LEVEL_3)

    # Number of complainant-side failed attempts before case becomes VOID.
    rejection_count = models.PositiveSmallIntegerField(default=0)

    crime_scene_datetime = models.DateTimeField(null=True, blank=True)

    complainants = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="complaints",
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_cases",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approved_cases",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        permissions = [
            ("can_verify_complaint", "Can verify initial complaint (Cadet)"),
            ("can_approve_case", "Can approve case creation (Officer)"),
            ("can_issue_warrant", "Can issue arrest warrant (Sergeant)"),
            ("can_close_case", "Can close the case (Captain/Chief)"),
        ]

    def __str__(self):
        return f"Case #{self.pk}: {self.title}"

    def register_complainant_rejection(self):
        self.rejection_count += 1
        if self.rejection_count >= 3:
            self.status = self.Status.VOID
        self.save(update_fields=["rejection_count", "status", "updated_at"])


class CaseReview(models.Model):
    class Step(models.TextChoices):
        CADET = "Cadet", _("Cadet Review")
        OFFICER = "Officer", _("Officer Review")
        SUPERVISOR = "Supervisor", _("Supervisor Review")

    class Decision(models.TextChoices):
        APPROVE = "Approve", _("Approve")
        REJECT = "Reject", _("Reject")
        RETURN_FOR_FIX = "ReturnForFix", _("Return For Fix")

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    step = models.CharField(max_length=20, choices=Step.choices)
    decision = models.CharField(max_length=20, choices=Decision.choices)
    message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.case_id} | {self.step} | {self.decision}"


class CaseLog(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="logs")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["timestamp"]

    def __str__(self):
        return f"{self.case_id} - {self.action}"
