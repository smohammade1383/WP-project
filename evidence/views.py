from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from cases.models import Case, Notification
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
from .serializers import (
    EvidenceOfficerReviewSerializer,
    EvidencePartialUpdateSerializer,
    EvidenceSerializer,
    EvidenceWriteSerializer,
)

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

OFFICER_REVIEW_ROLES = {
    "Administrator",
    "Chief",
    "Captain",
    "Sergeant",
    "Police Officer",
    "Patrol Officer",
}


def has_any_role(user, *roles):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    expected = set(roles)
    if "Sergeant" in expected:
        expected.add("Sergent")
    if "Sergent" in expected:
        expected.add("Sergeant")
    return any(role in expected for role in user.role_names)


def is_police_staff(user):
    return has_any_role(user, *POLICE_ROLES)


def is_officer_reviewer(user):
    return has_any_role(user, *OFFICER_REVIEW_ROLES)


def is_admin(user):
    return bool(user and user.is_authenticated and (user.is_superuser or has_any_role(user, "Administrator")))


def can_set_lab_result(user):
    return bool(user and user.is_authenticated and (user.is_superuser or has_any_role(user, "Coroner", "Administrator")))


def requires_officer_review_for_user(user):
    return not (is_police_staff(user) or has_any_role(user, "Judge", "Coroner"))


def can_submit_evidence(user, case_obj):
    return bool(user and user.is_authenticated)


def push_notification(*, recipient, message, case_obj=None, evidence=None):
    if not recipient or not getattr(recipient, "is_active", False):
        return
    Notification.objects.create(
        recipient=recipient,
        case=case_obj,
        evidence=evidence,
        message=message,
    )


def notify_role_recipients(*, role_names, message, case_obj=None, evidence=None, exclude_user_id=None):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    normalized_roles = set(role_names)
    if "Sergeant" in normalized_roles:
        normalized_roles.add("Sergent")
    if "Sergent" in normalized_roles:
        normalized_roles.add("Sergeant")
    recipients = User.objects.filter(is_active=True).filter(
        Q(groups__name__in=normalized_roles) | Q(is_superuser=True)
    ).distinct()
    for recipient in recipients:
        if exclude_user_id and recipient.id == exclude_user_id:
            continue
        push_notification(recipient=recipient, message=message, case_obj=case_obj, evidence=evidence)


def notify_case_detective(case_obj, message, evidence, *, exclude_user_id=None):
    board = getattr(case_obj, "board", None)
    if board and board.detective_id and board.detective_id != exclude_user_id:
        push_notification(
            recipient=board.detective,
            message=message,
            case_obj=case_obj,
            evidence=evidence,
        )


def create_evidence_details(evidence, validated_data, files, user):
    if evidence.type == Evidence.Type.TRANSCRIPTION:
        transcription = TranscriptionEvidence.objects.create(
            evidence=evidence,
            transcript_text=validated_data.get("transcript_text", ""),
        )
        for media_file in files.getlist("media_files"):
            TranscriptionMedia.objects.create(transcription=transcription, media_file=media_file)

    elif evidence.type == Evidence.Type.BIO_MEDICAL:
        if "lab_result" in validated_data and not can_set_lab_result(user):
            raise PermissionDenied("Only coroner roles can set lab_result.")
        if "bio_validation_status" in validated_data and not can_set_lab_result(user):
            raise PermissionDenied("Only coroner roles can set validation status.")
        bio = BioMedicalEvidence.objects.create(
            evidence=evidence,
            result_followup=validated_data.get("result_followup", ""),
            lab_result=validated_data.get("lab_result", ""),
            validation_status=BioMedicalEvidence.ValidationStatus.PENDING,
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


def update_evidence_details(evidence, validated_data, files, user):
    if evidence.type == Evidence.Type.TRANSCRIPTION and hasattr(evidence, "transcription"):
        transcription = evidence.transcription
        if "transcript_text" in validated_data:
            transcription.transcript_text = validated_data["transcript_text"]
            transcription.save(update_fields=["transcript_text"])
        for media_file in files.getlist("media_files"):
            TranscriptionMedia.objects.create(transcription=transcription, media_file=media_file)

    elif evidence.type == Evidence.Type.BIO_MEDICAL and hasattr(evidence, "bio_medical"):
        bio = evidence.bio_medical
        updated_fields = set()
        if "result_followup" in validated_data:
            bio.result_followup = validated_data["result_followup"]
            updated_fields.add("result_followup")
        if "lab_result" in validated_data:
            if not can_set_lab_result(user):
                raise PermissionDenied("Only coroner roles can set lab_result.")
            bio.lab_result = validated_data["lab_result"]
            updated_fields.add("lab_result")
        if "bio_validation_status" in validated_data:
            if not can_set_lab_result(user):
                raise PermissionDenied("Only coroner roles can set validation status.")
            new_status = validated_data["bio_validation_status"]
            if new_status == BioMedicalEvidence.ValidationStatus.ACCEPTED and not (
                validated_data.get("lab_result", "").strip() or bio.lab_result.strip()
            ):
                raise ValidationError({"lab_result": "Accepted bio evidence must include lab_result."})
            bio.validation_status = new_status
            updated_fields.add("validation_status")

        if updated_fields:
            bio.save(update_fields=list(updated_fields))
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
        queryset = Evidence.objects.select_related("case", "created_by", "officer_reviewer").all()
        if is_officer_reviewer(user):
            pass
        elif is_police_staff(user) or has_any_role(user, "Judge", "Coroner"):
            queryset = queryset.filter(
                Q(officer_review_status=Evidence.OfficerReviewStatus.APPROVED) | Q(created_by=user)
            ).distinct()
        else:
            queryset = queryset.filter(created_by=user).distinct()

        case_id = self.request.query_params.get("case")
        if case_id:
            queryset = queryset.filter(case_id=case_id)
        review_status = self.request.query_params.get("review_status")
        if review_status in {
            Evidence.OfficerReviewStatus.PENDING,
            Evidence.OfficerReviewStatus.APPROVED,
            Evidence.OfficerReviewStatus.REJECTED,
        }:
            queryset = queryset.filter(officer_review_status=review_status)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = EvidenceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        case_obj = validated["case"]
        if not can_submit_evidence(request.user, case_obj):
            raise PermissionDenied("You cannot add evidence to this case.")

        needs_review = requires_officer_review_for_user(request.user)
        evidence = Evidence.objects.create(
            case=case_obj,
            title=validated["title"],
            description=validated["description"],
            type=validated["type"],
            created_by=request.user,
            officer_review_status=(
                Evidence.OfficerReviewStatus.PENDING
                if needs_review
                else Evidence.OfficerReviewStatus.APPROVED
            ),
            officer_reviewer=None if needs_review else request.user,
            officer_reviewed_at=None if needs_review else timezone.now(),
            officer_review_message=(
                ""
                if needs_review
                else "Auto-approved for police/court/coroner roles."
            ),
        )
        create_evidence_details(evidence, validated, request.FILES, request.user)

        if needs_review:
            notify_role_recipients(
                role_names=OFFICER_REVIEW_ROLES,
                message=(
                    f"مدرک جدید #{evidence.id} برای پرونده #{case_obj.id} نیازمند بررسی افسر است."
                ),
                case_obj=case_obj,
                evidence=evidence,
                exclude_user_id=request.user.id,
            )
        else:
            notify_case_detective(
                case_obj,
                f"مدرک #{evidence.id} برای پرونده #{case_obj.id} ثبت شد و آماده بررسی کارآگاه است.",
                evidence,
                exclude_user_id=request.user.id,
            )

        return Response(EvidenceSerializer(evidence, context={"request": request}).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(tags=["Evidence"], summary="List pending evidence for officer review"),
)
class EvidenceOfficerPendingListAPIView(generics.ListAPIView):
    serializer_class = EvidenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not is_officer_reviewer(user):
            raise PermissionDenied("Only officer+ roles can review evidence.")
        queryset = (
            Evidence.objects.select_related("case", "created_by", "officer_reviewer")
            .filter(officer_review_status=Evidence.OfficerReviewStatus.PENDING)
            .order_by("-created_at")
        )
        case_id = self.request.query_params.get("case")
        if case_id:
            queryset = queryset.filter(case_id=case_id)
        return queryset


@extend_schema(
    tags=["Evidence"],
    summary="Officer approves/rejects an evidence record",
    request=EvidenceOfficerReviewSerializer,
    responses={200: EvidenceSerializer},
)
class EvidenceOfficerReviewAPIView(generics.GenericAPIView):
    serializer_class = EvidenceOfficerReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if not is_officer_reviewer(request.user):
            raise PermissionDenied("Only officer+ roles can review evidence.")

        evidence = get_object_or_404(
            Evidence.objects.select_related("case", "created_by", "officer_reviewer"),
            pk=pk,
        )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision = serializer.validated_data["decision"]
        message = serializer.validated_data.get("message", "")

        evidence.officer_review_status = decision
        evidence.officer_reviewer = request.user
        evidence.officer_reviewed_at = timezone.now()
        evidence.officer_review_message = message
        evidence.save(
            update_fields=[
                "officer_review_status",
                "officer_reviewer",
                "officer_reviewed_at",
                "officer_review_message",
            ]
        )

        decision_text = "تایید" if decision == Evidence.OfficerReviewStatus.APPROVED else "رد"
        if evidence.created_by_id != request.user.id:
            push_notification(
                recipient=evidence.created_by,
                case_obj=evidence.case,
                evidence=evidence,
                message=(
                    f"مدرک #{evidence.id} توسط افسر {decision_text} شد."
                    f"{' توضیح: ' + message if message else ''}"
                ),
            )

        if decision == Evidence.OfficerReviewStatus.APPROVED:
            notify_case_detective(
                evidence.case,
                f"مدرک #{evidence.id} برای پرونده #{evidence.case_id} توسط افسر تایید شد.",
                evidence,
                exclude_user_id=request.user.id,
            )

        return Response(EvidenceSerializer(evidence, context={"request": request}).data)


@extend_schema_view(
    get=extend_schema(tags=["Evidence"], summary="Retrieve evidence"),
    patch=extend_schema(tags=["Evidence"], summary="Update evidence"),
    delete=extend_schema(tags=["Evidence"], summary="Delete evidence"),
)
class EvidenceRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Evidence.objects.select_related("case", "created_by", "officer_reviewer")
    serializer_class = EvidenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        evidence = super().get_object()
        user = self.request.user
        if is_officer_reviewer(user):
            return evidence
        if is_police_staff(user) or has_any_role(user, "Judge", "Coroner"):
            if (
                evidence.officer_review_status == Evidence.OfficerReviewStatus.APPROVED
                or evidence.created_by_id == user.id
            ):
                return evidence
            raise PermissionDenied("This evidence is still pending officer review.")
        if evidence.created_by_id != user.id:
            raise PermissionDenied("You cannot access this evidence.")
        return evidence

    def patch(self, request, *args, **kwargs):
        evidence = self.get_object()
        can_owner_edit = evidence.created_by_id == request.user.id or is_admin(request.user)
        can_coroner_bio_edit = (
            evidence.type == Evidence.Type.BIO_MEDICAL
            and can_set_lab_result(request.user)
        )
        if not (can_owner_edit or can_coroner_bio_edit):
            raise PermissionDenied("You cannot edit this evidence.")

        serializer = EvidencePartialUpdateSerializer(data=request.data, context={"evidence": evidence})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        owner_changed_any_field = bool(validated)

        if can_coroner_bio_edit and not can_owner_edit:
            allowed_fields = {"lab_result", "result_followup", "bio_validation_status"}
            blocked_fields = sorted(set(validated.keys()) - allowed_fields)
            if blocked_fields:
                raise PermissionDenied(
                    f"Coroner can only update bio validation fields: {', '.join(sorted(allowed_fields))}."
                )

        changed_fields = []
        if can_owner_edit:
            for field in ["title", "description"]:
                if field in validated:
                    setattr(evidence, field, validated[field])
                    changed_fields.append(field)
            if "case" in validated:
                evidence.case = validated["case"]
                changed_fields.append("case")
        if changed_fields:
            evidence.save(update_fields=changed_fields)

        update_evidence_details(evidence, validated, request.FILES, request.user)

        if can_owner_edit and owner_changed_any_field and requires_officer_review_for_user(request.user):
            evidence.officer_review_status = Evidence.OfficerReviewStatus.PENDING
            evidence.officer_reviewer = None
            evidence.officer_reviewed_at = None
            evidence.officer_review_message = ""
            evidence.save(
                update_fields=[
                    "officer_review_status",
                    "officer_reviewer",
                    "officer_reviewed_at",
                    "officer_review_message",
                ]
            )
            notify_role_recipients(
                role_names=OFFICER_REVIEW_ROLES,
                message=f"مدرک #{evidence.id} ویرایش شد و نیازمند بررسی مجدد افسر است.",
                case_obj=evidence.case,
                evidence=evidence,
                exclude_user_id=request.user.id,
            )

        return Response(EvidenceSerializer(evidence, context={"request": request}).data)

    def perform_destroy(self, instance):
        user = self.request.user
        if not (instance.created_by_id == user.id or is_admin(user)):
            raise PermissionDenied("Only the evidence owner or an administrator can delete this evidence.")
        instance.delete()
