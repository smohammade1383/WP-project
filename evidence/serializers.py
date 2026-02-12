from django.contrib.auth import get_user_model
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from cases.models import Case

from .models import (
    Evidence,
)

User = get_user_model()


class EvidenceUserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name")


class EvidenceSerializer(serializers.ModelSerializer):
    created_by = EvidenceUserBriefSerializer(read_only=True)
    details = serializers.SerializerMethodField()

    class Meta:
        model = Evidence
        fields = (
            "id",
            "case",
            "title",
            "description",
            "type",
            "created_by",
            "created_at",
            "details",
        )

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_details(self, obj):
        if obj.type == Evidence.Type.TRANSCRIPTION and hasattr(obj, "transcription"):
            return {
                "transcript_text": obj.transcription.transcript_text,
                "media_files": [media.media_file.name for media in obj.transcription.media_files.all()],
            }
        if obj.type == Evidence.Type.BIO_MEDICAL and hasattr(obj, "bio_medical"):
            return {
                "result_followup": obj.bio_medical.result_followup,
                "lab_result": obj.bio_medical.lab_result,
                "validation_status": obj.bio_medical.validation_status,
                "is_validated": obj.bio_medical.validation_status == obj.bio_medical.ValidationStatus.ACCEPTED,
                "images": [img.image_file.name for img in obj.bio_medical.images.all()],
            }
        if obj.type == Evidence.Type.VEHICLE and hasattr(obj, "vehicle"):
            return {
                "model": obj.vehicle.model,
                "color": obj.vehicle.color,
                "license_plate": obj.vehicle.license_plate,
                "serial_number": obj.vehicle.serial_number,
            }
        if obj.type == Evidence.Type.IDENTITY_DOCUMENT and hasattr(obj, "identity_document"):
            fields = {
                item.key: item.value for item in obj.identity_document.fields.all()
            }
            return {
                "owner_full_name": obj.identity_document.owner_full_name,
                "fields": fields,
            }
        return {}


class EvidenceWriteSerializer(serializers.Serializer):
    case = serializers.PrimaryKeyRelatedField(queryset=Case.objects.all())
    title = serializers.CharField(max_length=200)
    description = serializers.CharField()
    type = serializers.ChoiceField(choices=Evidence.Type.choices)

    transcript_text = serializers.CharField(required=False, allow_blank=True)
    result_followup = serializers.CharField(required=False, allow_blank=True)
    lab_result = serializers.CharField(required=False, allow_blank=True)
    bio_validation_status = serializers.ChoiceField(
        choices=["pending", "accepted", "rejected"],
        required=False,
    )
    vehicle_model = serializers.CharField(required=False, allow_blank=True)
    vehicle_color = serializers.CharField(required=False, allow_blank=True)
    license_plate = serializers.CharField(required=False, allow_blank=True)
    serial_number = serializers.CharField(required=False, allow_blank=True)
    owner_full_name = serializers.CharField(required=False, allow_blank=True)
    identity_fields = serializers.DictField(child=serializers.CharField(), required=False)

    def validate(self, attrs):
        evidence_type = attrs["type"]

        if evidence_type == Evidence.Type.TRANSCRIPTION and not attrs.get("transcript_text"):
            raise serializers.ValidationError({"transcript_text": "This field is required for transcription evidence."})

        if evidence_type == Evidence.Type.VEHICLE:
            if not attrs.get("vehicle_model") or not attrs.get("vehicle_color"):
                raise serializers.ValidationError({"vehicle_model": "model/color are required for vehicle evidence."})
            if bool(attrs.get("license_plate")) == bool(attrs.get("serial_number")):
                raise serializers.ValidationError(
                    {"non_field_errors": "Exactly one of license_plate or serial_number must be provided."}
                )

        if evidence_type == Evidence.Type.IDENTITY_DOCUMENT and not attrs.get("owner_full_name"):
            raise serializers.ValidationError({"owner_full_name": "This field is required for identity-document evidence."})

        return attrs


class EvidencePartialUpdateSerializer(EvidenceWriteSerializer):
    case = serializers.PrimaryKeyRelatedField(queryset=Case.objects.all(), required=False)
    title = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False)
    type = serializers.ChoiceField(choices=Evidence.Type.choices, required=False)

    def validate(self, attrs):
        evidence = self.context.get("evidence")
        evidence_type = evidence.type

        if evidence_type == Evidence.Type.VEHICLE:
            license_plate = attrs.get("license_plate")
            serial_number = attrs.get("serial_number")
            if license_plate is not None or serial_number is not None:
                effective_plate = license_plate if license_plate is not None else (evidence.vehicle.license_plate if hasattr(evidence, "vehicle") else "")
                effective_serial = serial_number if serial_number is not None else (evidence.vehicle.serial_number if hasattr(evidence, "vehicle") else "")
                if bool(effective_plate) == bool(effective_serial):
                    raise serializers.ValidationError(
                        {"non_field_errors": "Exactly one of license_plate or serial_number must be provided."}
                    )

        return attrs
