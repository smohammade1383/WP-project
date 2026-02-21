from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
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
        ARRESTED = "Arrested", _("Suspect Arrested")
        WAITING_CAPTAIN = "WaitingCaptain", _("Waiting For Captain Decision")
        WAITING_CHIEF = "WaitingChief", _("Waiting For Chief Confirmation")
        IN_COURT = "InCourt", _("Sent to Court")
        CLOSED = "Closed", _("Case Closed")
        VOID = "Void", _("Void")

    class Severity(models.IntegerChoices):
        LEVEL_3 = 1, _("Level 3 (Petty)")
        LEVEL_2 = 2, _("Level 2")
        LEVEL_1 = 3, _("Level 1")
        CRITICAL = 4, _("Critical")

    title = models.CharField(max_length=200)
    description = models.TextField()
    location = models.CharField(max_length=255)
    incident_datetime = models.DateTimeField(default=timezone.now)

    source_type = models.CharField(max_length=20, choices=SourceType.choices, default=SourceType.COMPLAINT)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    severity = models.IntegerField(choices=Severity.choices, default=Severity.LEVEL_3)

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

    complainants = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="complaint_cases", blank=True)
    witnesses = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="witness_cases", blank=True)
    suspects = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="suspect_cases", blank=True)

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

    def can_transition_to(self, new_status: str) -> bool:
        allowed = {
            self.Status.DRAFT: {self.Status.PENDING_CADET, self.Status.VOID},
            self.Status.PENDING_CADET: {
                self.Status.NEEDS_COMPLAINANT_UPDATE,
                self.Status.PENDING_OFFICER,
                self.Status.VOID,
            },
            self.Status.NEEDS_COMPLAINANT_UPDATE: {self.Status.PENDING_CADET, self.Status.VOID},
            self.Status.PENDING_OFFICER: {self.Status.OPEN, self.Status.NEEDS_COMPLAINANT_UPDATE, self.Status.VOID},
            self.Status.OPEN: {self.Status.WARRANT_PENDING, self.Status.ARRESTED, self.Status.CLOSED},
            self.Status.WARRANT_PENDING: {self.Status.ARRESTED, self.Status.OPEN, self.Status.CLOSED},
            self.Status.ARRESTED: {
                self.Status.WAITING_CAPTAIN,
                self.Status.WAITING_CHIEF,
                self.Status.IN_COURT,
                self.Status.OPEN,
                self.Status.CLOSED,
            },
            self.Status.WAITING_CAPTAIN: {
                self.Status.IN_COURT,
                self.Status.WAITING_CHIEF,
                self.Status.ARRESTED,
                self.Status.OPEN,
                self.Status.CLOSED,
            },
            self.Status.WAITING_CHIEF: {
                self.Status.IN_COURT,
                self.Status.ARRESTED,
                self.Status.OPEN,
                self.Status.CLOSED,
            },
            self.Status.IN_COURT: {self.Status.CLOSED},
            self.Status.CLOSED: set(),
            self.Status.VOID: set(),
        }
        return new_status in allowed.get(self.status, set())

    def transition_to(self, new_status: str):
        if not self.can_transition_to(new_status):
            raise ValidationError(f"Invalid transition from {self.status} to {new_status}.")
        self.status = new_status
        self.save(update_fields=["status", "updated_at"])


class CrimeSceneWitness(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="local_witnesses")
    full_name = models.CharField(max_length=150, blank=True)
    national_id = models.CharField(max_length=10)
    phone_number = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("case", "national_id", "phone_number")
        ordering = ["id"]


class Complaint(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", _("Submitted")
        RETURNED = "returned", _("Returned")
        APPROVED = "approved", _("Approved")
        REJECTED = "rejected", _("Rejected")
        VOID = "void", _("Void")

    case = models.ForeignKey(Case, on_delete=models.SET_NULL, related_name="complaints", null=True, blank=True)
    submitter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="submitted_complaints")
    title = models.CharField(max_length=200)
    description = models.TextField()
    location = models.CharField(max_length=255)
    incident_datetime = models.DateTimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)
    invalid_attempt_count = models.PositiveSmallIntegerField(default=0)
    complainants = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="complaints_as_complainant", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def register_invalid_attempt(self):
        self.invalid_attempt_count += 1
        if self.invalid_attempt_count >= 3:
            self.status = self.Status.VOID
        else:
            self.status = self.Status.RETURNED
        self.save(update_fields=["invalid_attempt_count", "status", "updated_at"])


class ComplaintReview(models.Model):
    class Step(models.TextChoices):
        CADET = "cadet", _("Cadet")
        OFFICER = "officer", _("Officer")

    class Decision(models.TextChoices):
        APPROVED = "approved", _("Approved")
        REJECTED = "rejected", _("Rejected")
        RETURNED = "returned", _("Returned")

    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    step = models.CharField(max_length=20, choices=Step.choices)
    decision = models.CharField(max_length=20, choices=Decision.choices)
    message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def save(self, *args, **kwargs):
        if self.decision == self.Decision.RETURNED and not self.message.strip():
            raise ValidationError("Returned review must include a message.")
        super().save(*args, **kwargs)


class SecondaryComplainant(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        APPROVED = "approved", _("Approved")
        REJECTED = "rejected", _("Rejected")

    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="secondary_complainants")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="secondary_complaints")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_secondary_complainants",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_secondary_complainants",
    )
    review_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("complaint", "user")
        ordering = ["-created_at"]


class CaseLog(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="logs")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["timestamp"]


class Notification(models.Model):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="notifications", null=True, blank=True)
    evidence = models.ForeignKey(
        "evidence.Evidence",
        on_delete=models.CASCADE,
        related_name="notifications",
        null=True,
        blank=True,
    )
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class DetectiveBoard(models.Model):
    case = models.OneToOneField(Case, on_delete=models.CASCADE, related_name="board")
    detective = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)


class BoardItem(models.Model):
    class ItemType(models.TextChoices):
        NOTE = "note", _("Note")
        EVIDENCE = "evidence", _("Evidence")
        WITNESS = "witness", _("Witness")
        SUSPECT = "suspect", _("Suspect")

    board = models.ForeignKey(DetectiveBoard, on_delete=models.CASCADE, related_name="items")
    item_type = models.CharField(max_length=20, choices=ItemType.choices)
    note_text = models.TextField(blank=True)
    evidence = models.ForeignKey("evidence.Evidence", null=True, blank=True, on_delete=models.SET_NULL)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    position_x = models.FloatField(default=0)
    position_y = models.FloatField(default=0)
    width = models.FloatField(default=300)
    height = models.FloatField(default=160)

    def clean(self):
        if self.item_type == self.ItemType.NOTE and not self.note_text.strip():
            raise ValidationError("note_text is required for note items.")
        if self.item_type == self.ItemType.EVIDENCE and not self.evidence_id:
            raise ValidationError("evidence is required for evidence items.")
        if self.item_type in {self.ItemType.WITNESS, self.ItemType.SUSPECT} and not self.user_id:
            raise ValidationError("user is required for witness/suspect items.")


class BoardLink(models.Model):
    board = models.ForeignKey(DetectiveBoard, on_delete=models.CASCADE, related_name="links")
    from_item = models.ForeignKey(BoardItem, on_delete=models.CASCADE, related_name="out_links")
    to_item = models.ForeignKey(BoardItem, on_delete=models.CASCADE, related_name="in_links")
    description = models.TextField(blank=True)

    def clean(self):
        if self.from_item_id and self.to_item_id and self.from_item_id == self.to_item_id:
            raise ValidationError("from_item and to_item cannot be the same.")
        if self.from_item_id and self.board_id and self.from_item.board_id != self.board_id:
            raise ValidationError("from_item must belong to the same board.")
        if self.to_item_id and self.board_id and self.to_item.board_id != self.board_id:
            raise ValidationError("to_item must belong to the same board.")


class BoardConnection(models.Model):
    board = models.ForeignKey(DetectiveBoard, on_delete=models.CASCADE, related_name="connections")
    from_evidence = models.ForeignKey(
        "evidence.Evidence",
        on_delete=models.CASCADE,
        related_name="board_connections_from",
    )
    to_evidence = models.ForeignKey(
        "evidence.Evidence",
        on_delete=models.CASCADE,
        related_name="board_connections_to",
    )
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        if self.from_evidence_id and self.to_evidence_id and self.from_evidence_id == self.to_evidence_id:
            raise ValidationError("from_evidence and to_evidence cannot be the same.")
        if self.board_id and self.from_evidence_id and self.from_evidence.case_id != self.board.case_id:
            raise ValidationError("from_evidence must belong to the same case as the board.")
        if self.board_id and self.to_evidence_id and self.to_evidence.case_id != self.board.case_id:
            raise ValidationError("to_evidence must belong to the same case as the board.")

class SuspectCaseProfile(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="suspect_profiles")
    suspect = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="case_profiles")
    wanted_since = models.DateTimeField(auto_now_add=True)
    arrest_warrant_issued = models.BooleanField(default=False)
    is_arrested = models.BooleanField(default=False)
    is_bail_allowed = models.BooleanField(default=False)
    bail_amount = models.PositiveBigIntegerField(null=True, blank=True)
    severe_tracking = models.BooleanField(default=False)
    public_photo = models.URLField(blank=True)
    public_details = models.TextField(blank=True)

    class Meta:
        unique_together = ("case", "suspect")

    @property
    def wanted_days(self):
        if not self.wanted_since:
            return 1
        # Day counting starts from 1 as soon as a suspect enters wanted state.
        return max((timezone.now() - self.wanted_since).days, 1)

    @property
    def is_severe_tracking(self):
        return (
            self.case.status not in {Case.Status.CLOSED, Case.Status.VOID}
            and self.wanted_days > 30
        )

    @property
    def ranking_score(self):
        profiles = self.suspect.case_profiles.select_related("case").all()
        if not profiles:
            return 0
        open_profiles = [
            profile
            for profile in profiles
            if profile.case.status not in {Case.Status.CLOSED, Case.Status.VOID}
        ]
        if open_profiles:
            max_days = max(profile.wanted_days for profile in open_profiles)
        else:
            max_days = 0
        max_degree = max(profile.case.severity for profile in profiles)
        return max_days * max_degree

    @property
    def reward_amount(self):
        return self.ranking_score * 20_000_000

    def save(self, *args, **kwargs):
        self.severe_tracking = self.is_severe_tracking
        super().save(*args, **kwargs)


class InterrogationScore(models.Model):
    class ScorerRole(models.TextChoices):
        DETECTIVE = "detective", _("Detective")
        SERGEANT = "sergeant", _("Sergeant")

    suspect_profile = models.ForeignKey(SuspectCaseProfile, on_delete=models.CASCADE, related_name="scores")
    scorer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    scorer_role = models.CharField(max_length=20, choices=ScorerRole.choices)
    score = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(10)])
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class CaptainDecision(models.Model):
    suspect_profile = models.ForeignKey(SuspectCaseProfile, on_delete=models.CASCADE, related_name="captain_decisions")
    captain = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="captain_decisions")
    chief = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="chief_decisions",
        null=True,
        blank=True,
    )
    is_confirmed = models.BooleanField(default=False)
    chief_confirmed = models.BooleanField(null=True, blank=True)
    summary = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        if self.chief_id and self.chief_confirmed is None:
            raise ValidationError("chief_confirmed must be provided when chief is set.")
