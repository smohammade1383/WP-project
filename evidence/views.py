from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from cases.models import Case
from .models import (
    BioMedicalEvidence,
    BioMedicalImage,
    Evidence,
    IdentityDocumentEvidence,
    IdentityDocumentField,
    TranscriptionEvidence,
    TranscriptionMedia,
    VehicleEvidence,
)
from .serializers import EvidencePartialUpdateSerializer, EvidenceSerializer, EvidenceWriteSerializer

POLICE_ROLES = {
    "Administrator",
    "Chief",
    "Captain",
    "Sergeant",
    "Detective",
    "Police Officer",
    "Patrol Officer",
    "Cadet",
}


def has_any_role(user, *roles):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    expected = set(roles)
    return any(role in expected for role in user.role_names)


def is_police_staff(user):
    return has_any_role(user, *POLICE_ROLES)


def is_admin(user):
    return bool(user and user.is_authenticated and (user.is_superuser or has_any_role(user, "Administrator")))


def can_submit_evidence(user, case_obj):
    if is_police_staff(user):
        return True
    return case_obj.created_by_id == user.id or case_obj.complainants.filter(id=user.id).exists()


def create_evidence_details(evidence, validated_data, files):
    if evidence.type == Evidence.Type.TRANSCRIPTION:
        transcription = TranscriptionEvidence.objects.create(
            evidence=evidence,
            transcript_text=validated_data.get("transcript_text", ""),
        )
        for media_file in files.getlist("media_files"):
            TranscriptionMedia.objects.create(transcription=transcription, media_file=media_file)

    elif evidence.type == Evidence.Type.BIO_MEDICAL:
        bio = BioMedicalEvidence.objects.create(
            evidence=evidence,
            result_followup=validated_data.get("result_followup", ""),
        )
        for image_file in files.getlist("images"):
            BioMedicalImage.objects.create(bio_medical=bio, image_file=image_file)

    elif evidence.type == Evidence.Type.VEHICLE:
        vehicle = VehicleEvidence(
            evidence=evidence,
            model=validated_data.get("vehicle_model", ""),
            color=validated_data.get("vehicle_color", ""),
            license_plate=validated_data.get("license_plate", ""),
            serial_number=validated_data.get("serial_number", ""),
        )
        try:
            vehicle.full_clean()
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict or exc.messages)
        vehicle.save()

    elif evidence.type == Evidence.Type.IDENTITY_DOCUMENT:
        identity = IdentityDocumentEvidence.objects.create(
            evidence=evidence,
            owner_full_name=validated_data.get("owner_full_name", ""),
        )
        for key, value in validated_data.get("identity_fields", {}).items():
            IdentityDocumentField.objects.create(identity_document=identity, key=key, value=value)


def update_evidence_details(evidence, validated_data, files):
    if evidence.type == Evidence.Type.TRANSCRIPTION and hasattr(evidence, "transcription"):
        transcription = evidence.transcription
        if "transcript_text" in validated_data:
            transcription.transcript_text = validated_data["transcript_text"]
            transcription.save(update_fields=["transcript_text"])
        for media_file in files.getlist("media_files"):
            TranscriptionMedia.objects.create(transcription=transcription, media_file=media_file)

    elif evidence.type == Evidence.Type.BIO_MEDICAL and hasattr(evidence, "bio_medical"):
        bio = evidence.bio_medical
        if "result_followup" in validated_data:
            bio.result_followup = validated_data["result_followup"]
            bio.save(update_fields=["result_followup"])
        for image_file in files.getlist("images"):
            BioMedicalImage.objects.create(bio_medical=bio, image_file=image_file)

    elif evidence.type == Evidence.Type.VEHICLE and hasattr(evidence, "vehicle"):
        vehicle = evidence.vehicle
        mapping = {
            "vehicle_model": "model",
            "vehicle_color": "color",
            "license_plate": "license_plate",
            "serial_number": "serial_number",
        }
        changed_fields = []
        for source, dest in mapping.items():
            if source in validated_data:
                setattr(vehicle, dest, validated_data[source])
                changed_fields.append(dest)
        if changed_fields:
            try:
                vehicle.full_clean()
            except DjangoValidationError as exc:
                raise ValidationError(exc.message_dict or exc.messages)
            vehicle.save(update_fields=changed_fields)

    elif evidence.type == Evidence.Type.IDENTITY_DOCUMENT and hasattr(evidence, "identity_document"):
        identity = evidence.identity_document
        if "owner_full_name" in validated_data:
            identity.owner_full_name = validated_data["owner_full_name"]
            identity.save(update_fields=["owner_full_name"])
        if "identity_fields" in validated_data:
            identity.fields.all().delete()
            for key, value in validated_data["identity_fields"].items():
                IdentityDocumentField.objects.create(identity_document=identity, key=key, value=value)


@extend_schema_view(
    get=extend_schema(tags=["Evidence"], summary="List evidence"),
    post=extend_schema(tags=["Evidence"], summary="Create evidence"),
)
class EvidenceListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = EvidenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Evidence.objects.select_related("case", "created_by").all()
        if is_police_staff(user) or has_any_role(user, "Judge", "Coroner"):
            pass
        else:
            queryset = queryset.filter(
                Q(case__created_by=user) | Q(case__complainants=user) | Q(created_by=user)
            ).distinct()

        case_id = self.request.query_params.get("case")
        if case_id:
            queryset = queryset.filter(case_id=case_id)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = EvidenceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        case_obj = validated["case"]
        if not can_submit_evidence(request.user, case_obj):
            raise PermissionDenied("You cannot add evidence to this case.")

        evidence = Evidence.objects.create(
            case=case_obj,
            title=validated["title"],
            description=validated["description"],
            type=validated["type"],
            created_by=request.user,
        )
        create_evidence_details(evidence, validated, request.FILES)

        return Response(EvidenceSerializer(evidence, context={"request": request}).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(tags=["Evidence"], summary="Retrieve evidence"),
    patch=extend_schema(tags=["Evidence"], summary="Update evidence"),
    delete=extend_schema(tags=["Evidence"], summary="Delete evidence"),
)
class EvidenceRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Evidence.objects.select_related("case", "created_by")
    serializer_class = EvidenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        evidence = super().get_object()
        user = self.request.user
        if is_police_staff(user) or has_any_role(user, "Judge", "Coroner"):
            return evidence
        if not (
            evidence.case.created_by_id == user.id
            or evidence.case.complainants.filter(id=user.id).exists()
            or evidence.created_by_id == user.id
        ):
            raise PermissionDenied("You cannot access this evidence.")
        return evidence

    def patch(self, request, *args, **kwargs):
        evidence = self.get_object()
        if not can_submit_evidence(request.user, evidence.case):
            raise PermissionDenied("You cannot edit this evidence.")

        serializer = EvidencePartialUpdateSerializer(data=request.data, context={"evidence": evidence})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        changed_fields = []
        for field in ["title", "description"]:
            if field in validated:
                setattr(evidence, field, validated[field])
                changed_fields.append(field)
        if "case" in validated:
            evidence.case = validated["case"]
            changed_fields.append("case")
        if changed_fields:
            evidence.save(update_fields=changed_fields)

        update_evidence_details(evidence, validated, request.FILES)
        return Response(EvidenceSerializer(evidence, context={"request": request}).data)

    def perform_destroy(self, instance):
        user = self.request.user
        if not (instance.created_by_id == user.id or is_admin(user)):
            raise PermissionDenied("Only the evidence owner or an administrator can delete this evidence.")
        instance.delete()
