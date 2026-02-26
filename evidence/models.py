from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Evidence(models.Model):
    class OfficerReviewStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class Type(models.TextChoices):
        TRANSCRIPTION = "transcription", "Transcription"
        BIO_MEDICAL = "bio_medical", "Bio/Medical"
        VEHICLE = "vehicle", "Vehicle"
        IDENTITY_DOCUMENT = "identity_document", "Identity Document"
        OTHER = "other", "Other"

    case = models.ForeignKey("cases.Case", on_delete=models.CASCADE, related_name="evidences")
    title = models.CharField(max_length=200)
    description = models.TextField()
    type = models.CharField(max_length=30, choices=Type.choices)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    officer_review_status = models.CharField(
        max_length=20,
        choices=OfficerReviewStatus.choices,
        default=OfficerReviewStatus.PENDING,
    )
    officer_review_message = models.TextField(blank=True, default="")
    officer_reviewed_at = models.DateTimeField(null=True, blank=True)
    officer_reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="officer_reviewed_evidences",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.type})"


class TranscriptionEvidence(models.Model):
    evidence = models.OneToOneField(Evidence, on_delete=models.CASCADE, related_name="transcription")
    transcript_text = models.TextField()


class TranscriptionMedia(models.Model):
    transcription = models.ForeignKey(TranscriptionEvidence, on_delete=models.CASCADE, related_name="media_files")
    media_file = models.FileField(upload_to="evidence/transcription/")


class BioMedicalEvidence(models.Model):
    class ValidationStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    evidence = models.OneToOneField(Evidence, on_delete=models.CASCADE, related_name="bio_medical")
    result_followup = models.TextField(blank=True)
    lab_result = models.TextField(blank=True)
    validation_status = models.CharField(
        max_length=20,
        choices=ValidationStatus.choices,
        default=ValidationStatus.PENDING,
    )


class BioMedicalImage(models.Model):
    bio_medical = models.ForeignKey(BioMedicalEvidence, on_delete=models.CASCADE, related_name="images")
    image_file = models.FileField(upload_to="evidence/biomedical/")


class VehicleEvidence(models.Model):
    evidence = models.OneToOneField(Evidence, on_delete=models.CASCADE, related_name="vehicle")
    model = models.CharField(max_length=128)
    color = models.CharField(max_length=64)
    license_plate = models.CharField(max_length=20, blank=True)
    serial_number = models.CharField(max_length=50, blank=True)

    def clean(self):
        if self.license_plate and self.serial_number:
            raise ValidationError("license_plate and serial_number cannot both be set.")
        if not self.license_plate and not self.serial_number:
            raise ValidationError("Either license_plate or serial_number must be set.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class IdentityDocumentEvidence(models.Model):
    evidence = models.OneToOneField(Evidence, on_delete=models.CASCADE, related_name="identity_document")
    owner_full_name = models.CharField(max_length=255)


class IdentityDocumentField(models.Model):
    identity_document = models.ForeignKey(
        IdentityDocumentEvidence,
        on_delete=models.CASCADE,
        related_name="fields",
    )
    key = models.CharField(max_length=100)
    value = models.TextField(blank=True)

    class Meta:
        unique_together = ("identity_document", "key")
