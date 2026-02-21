from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    BoardItem,
    BoardLink,
    BoardConnection,
    Case,
    CaseLog,
    CaptainDecision,
    CrimeSceneWitness,
    Complaint,
    ComplaintReview,
    DetectiveBoard,
    InterrogationScore,
    Notification,
    SecondaryComplainant,
    SuspectCaseProfile,
)
from .permissions import CanViewAggregatedStats
from .serializers import (
    AddComplainantsSerializer,
    BoardItemSerializer,
    BoardLinkSerializer,
    BoardConnectionSerializer,
    BreakdownStatsSerializer,
    CaptainDecisionCreateSerializer,
    CaptainDecisionSerializer,
    CaseSerializer,
    CitizenCaseSummarySerializer,
    ChiefDecisionSerializer,
    ComplaintDecisionSerializer,
    ComplaintReviewSerializer,
    ComplaintSerializer,
    CrimeSceneCaseCreateSerializer,
    DetectiveBoardSerializer,
    InterrogationScoreSerializer,
    NotificationSerializer,
    SergeantDecisionSerializer,
    SubmitToCaptainSerializer,
    SecondaryComplainantRequestSerializer,
    SecondaryComplainantReviewSerializer,
    SecondaryComplainantSerializer,
    SuspectCaseProfileSerializer,
    SuspectNominationSerializer,
    WantedUpdateSerializer,
)

User = get_user_model()

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

FULL_CASE_ACCESS_ROLES = {
    "Administrator",
    "Chief",
    "Captain",
    "Sergeant",
    "Police Officer",
    "Patrol Officer",
    "Cadet",
    "Coroner",
}

OFFICER_APPROVAL_ROLES = (
    "Police Officer",
    "Patrol Officer",
    "Sergeant",
    "Captain",
    "Chief",
    "Administrator",
)

BOARD_STRUCTURE_LOCKED_STATUSES = {
    Case.Status.WARRANT_PENDING,
    Case.Status.ARRESTED,
    Case.Status.WAITING_CAPTAIN,
    Case.Status.WAITING_CHIEF,
    Case.Status.IN_COURT,
    Case.Status.CLOSED,
    Case.Status.VOID,
}

BOARD_MOVE_ALLOWED_STATUSES = {
    Case.Status.OPEN,
    Case.Status.WARRANT_PENDING,
}

DETECTIVE_ACCEPTABLE_STATUSES = {
    Case.Status.OPEN,
    Case.Status.WARRANT_PENDING,
    Case.Status.ARRESTED,
    Case.Status.WAITING_CAPTAIN,
    Case.Status.WAITING_CHIEF,
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


def is_board_structure_locked(case_obj):
    return case_obj.status in BOARD_STRUCTURE_LOCKED_STATUSES


def can_move_board_items(case_obj):
    return case_obj.status in BOARD_MOVE_ALLOWED_STATUSES


def push_notification(*, recipient, message, case_obj=None, evidence=None):
    if not recipient or not getattr(recipient, "is_active", False):
        return
    Notification.objects.create(
        recipient=recipient,
        case=case_obj,
        evidence=evidence,
        message=message,
    )


def latest_reviewer_for_step(complaint, step):
    return (
        complaint.reviews.filter(step=step)
        .select_related("reviewer")
        .order_by("-created_at")
        .first()
    )


def get_case_detective(case_obj):
    board = getattr(case_obj, "board", None)
    if board and board.detective_id:
        return board.detective
    nomination_log = (
        case_obj.logs.filter(action="suspects_nominated")
        .select_related("actor")
        .order_by("-timestamp")
        .first()
    )
    return nomination_log.actor if nomination_log else None


def latest_submitter_to_captain(case_obj):
    submit_log = (
        case_obj.logs.filter(action="submitted_to_captain")
        .select_related("actor")
        .order_by("-timestamp")
        .first()
    )
    return submit_log.actor if submit_log else None


def push_role_notification(*, role_names, message, case_obj=None, evidence=None, exclude_user_id=None):
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


def can_access_case(user, case_obj):
    if has_any_role(user, *FULL_CASE_ACCESS_ROLES):
        return True
    if has_any_role(user, "Detective"):
        return case_obj.accepted_detective_id == user.id
    if has_any_role(user, "Judge"):
        return case_obj.accepted_judge_id == user.id
    return (
        case_obj.created_by_id == user.id
        or case_obj.complainants.filter(id=user.id).exists()
        or case_obj.witnesses.filter(id=user.id).exists()
        or case_obj.suspects.filter(id=user.id).exists()
    )


def can_list_cases(user):
    return has_any_role(
        user,
        *POLICE_ROLES,
        "Judge",
        "Coroner",
        "Basic User",
        "Complainant",
        "Witness",
        "Suspect",
        "Criminal",
    )


def case_queryset_for_user(user):
    base = Case.objects.all().prefetch_related("complainants", "witnesses", "suspects")
    if has_any_role(user, *FULL_CASE_ACCESS_ROLES):
        return base
    detective_role = has_any_role(user, "Detective")
    judge_role = has_any_role(user, "Judge")
    if detective_role or judge_role:
        filter_q = Q(pk__isnull=True)
        if detective_role:
            filter_q |= Q(accepted_detective=user)
        if judge_role:
            filter_q |= Q(accepted_judge=user)
        return base.filter(filter_q).distinct()
    return base.filter(
        Q(created_by=user) | Q(complainants=user) | Q(witnesses=user) | Q(suspects=user)
    ).distinct()


def ensure_detective_case_access(user, case_obj):
    if has_any_role(user, "Administrator"):
        return
    if not has_any_role(user, "Detective"):
        raise PermissionDenied("Only detective role can access detective workflows.")
    if case_obj.accepted_detective_id != user.id:
        raise PermissionDenied("You must accept this case before using detective workflows.")


def ensure_judge_case_access(user, case_obj):
    if has_any_role(user, "Administrator"):
        return
    if not has_any_role(user, "Judge"):
        raise PermissionDenied("Only judge role can access judiciary workflows.")
    if case_obj.accepted_judge_id != user.id:
        raise PermissionDenied("You must accept this case before using judiciary workflows.")


def complaint_queryset_for_user(user):
    base = Complaint.objects.all().prefetch_related(
        "complainants",
        "attachments",
        "reviews",
        "secondary_complainants__user",
        "secondary_complainants__requested_by",
        "secondary_complainants__reviewed_by",
    )
    if is_police_staff(user):
        return base
    return base.filter(Q(submitter=user) | Q(complainants=user)).distinct()


def ensure_case_from_complaint(complaint):
    if complaint.case:
        case_obj = complaint.case
    else:
        case_obj = Case.objects.create(
            title=complaint.title,
            description=complaint.description,
            location=complaint.location,
            incident_datetime=complaint.incident_datetime,
            source_type=Case.SourceType.COMPLAINT,
            status=Case.Status.PENDING_OFFICER,
            created_by=complaint.submitter,
        )
        complaint.case = case_obj
        complaint.save(update_fields=["case", "updated_at"])

    if complaint.complainants.exists():
        case_obj.complainants.add(*complaint.complainants.all())
    return case_obj


def promote_complaint_attachments_to_case_evidence(complaint, case_obj):
    from evidence.models import Evidence, TranscriptionEvidence, TranscriptionMedia

    pending_attachments = complaint.attachments.filter(promoted_evidence__isnull=True)
    for attachment in pending_attachments:
        created_by = attachment.uploaded_by if attachment.uploaded_by_id else complaint.submitter
        evidence_obj = Evidence.objects.create(
            case=case_obj,
            title=attachment.original_name or f"Complaint attachment #{attachment.id}",
            description=(
                f"Attachment submitted with complaint #{complaint.id}."
            ),
            type=Evidence.Type.TRANSCRIPTION,
            created_by=created_by,
        )
        transcription = TranscriptionEvidence.objects.create(
            evidence=evidence_obj,
            transcript_text=f"Imported from complaint #{complaint.id}.",
        )
        TranscriptionMedia.objects.create(
            transcription=transcription,
            media_file=attachment.file,
        )
        attachment.promoted_evidence = evidence_obj
        attachment.save(update_fields=["promoted_evidence"])


def ensure_board_for_case(case_obj, detective_user):
    board = getattr(case_obj, "board", None)
    if board:
        return board
    return DetectiveBoard.objects.create(case=case_obj, detective=detective_user)


@extend_schema_view(
    get=extend_schema(tags=["Cases"], summary="List accessible cases"),
    post=extend_schema(tags=["Cases"], summary="Create a case"),
)
class CaseListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return case_queryset_for_user(self.request.user)

    def list(self, request, *args, **kwargs):
        if not can_list_cases(request.user):
            raise PermissionDenied("You do not have permission to list cases.")
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user
        if not is_police_staff(user):
            raise PermissionDenied("Only police roles can directly create a case.")
        serializer.save(created_by=user)


@extend_schema_view(
    get=extend_schema(tags=["Cases"], summary="Retrieve case"),
    patch=extend_schema(tags=["Cases"], summary="Update case"),
)
class CaseRetrieveUpdateAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return case_queryset_for_user(self.request.user)

    def perform_update(self, serializer):
        user = self.request.user
        if not is_police_staff(user):
            raise PermissionDenied("Only police roles can modify cases.")
        serializer.save()


@extend_schema(
    tags=["Cases"],
    summary="List detective-pending cases that are not accepted by any detective yet",
    responses={200: CaseSerializer(many=True)},
)
class DetectivePendingCaseListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not has_any_role(request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can view this queue.")

        queryset = (
            Case.objects.filter(
                accepted_detective__isnull=True,
                status__in=DETECTIVE_ACCEPTABLE_STATUSES,
            )
            .select_related("created_by", "approved_by")
            .prefetch_related("complainants", "witnesses", "suspects", "local_witnesses")
            .order_by("-updated_at", "-id")
        )
        return Response(CaseSerializer(queryset, many=True, context={"request": request}).data)


@extend_schema(
    tags=["Cases"],
    summary="Accept a case for detective workflow ownership",
    responses={200: CaseSerializer},
)
class DetectiveCaseAcceptAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, case_id):
        if not has_any_role(request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can accept a case.")

        case_obj = get_object_or_404(Case, id=case_id)
        if case_obj.status not in DETECTIVE_ACCEPTABLE_STATUSES:
            raise ValidationError({"case": "This case is not in an acceptable detective state."})

        if (
            case_obj.accepted_detective_id
            and case_obj.accepted_detective_id != request.user.id
            and not has_any_role(request.user, "Administrator")
        ):
            raise PermissionDenied("This case is already accepted by another detective.")

        case_obj.accepted_detective = request.user
        case_obj.save(update_fields=["accepted_detective", "updated_at"])

        board = getattr(case_obj, "board", None)
        if board is None:
            ensure_board_for_case(case_obj, request.user)
        elif board.detective_id != request.user.id:
            board.detective = request.user
            board.save(update_fields=["detective"])

        return Response(CaseSerializer(case_obj, context={"request": request}).data)


@extend_schema(
    tags=["Cases"],
    summary="List judge-pending in-court cases that are not accepted by any judge yet",
    responses={200: CaseSerializer(many=True)},
)
class JudgePendingCaseListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not has_any_role(request.user, "Judge", "Administrator"):
            raise PermissionDenied("Only judge role can view this queue.")

        queryset = (
            Case.objects.filter(
                status=Case.Status.IN_COURT,
                accepted_judge__isnull=True,
            )
            .select_related("created_by", "approved_by")
            .prefetch_related("complainants", "witnesses", "suspects", "local_witnesses")
            .order_by("-updated_at", "-id")
        )
        return Response(CaseSerializer(queryset, many=True, context={"request": request}).data)


@extend_schema(
    tags=["Cases"],
    summary="Accept an in-court case for judge workflow ownership",
    responses={200: CaseSerializer},
)
class JudgeCaseAcceptAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, case_id):
        if not has_any_role(request.user, "Judge", "Administrator"):
            raise PermissionDenied("Only judge role can accept a case.")

        case_obj = get_object_or_404(Case, id=case_id)
        if case_obj.status != Case.Status.IN_COURT:
            raise ValidationError({"case": "Only in-court cases can be accepted by judge."})

        if (
            case_obj.accepted_judge_id
            and case_obj.accepted_judge_id != request.user.id
            and not has_any_role(request.user, "Administrator")
        ):
            raise PermissionDenied("This case is already accepted by another judge.")

        case_obj.accepted_judge = request.user
        case_obj.save(update_fields=["accepted_judge", "updated_at"])
        return Response(CaseSerializer(case_obj, context={"request": request}).data)


@extend_schema_view(
    get=extend_schema(tags=["Cases"], summary="List safe case summaries for regular users"),
)
class CitizenCaseSummaryListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        queryset = (
            Case.objects.all()
            .annotate(
                my_evidence_count=Count(
                    "evidences",
                    filter=Q(evidences__created_by=user),
                    distinct=True,
                ),
                total_evidence_count=Count("evidences", distinct=True),
            )
            .order_by("-updated_at", "-id")
        )
        serializer = CitizenCaseSummarySerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)


@extend_schema_view(
    get=extend_schema(tags=["Complaints"], summary="List accessible complaints"),
    post=extend_schema(tags=["Complaints"], summary="Create complaint"),
)
class ComplaintListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = ComplaintSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return complaint_queryset_for_user(self.request.user)

    def perform_create(self, serializer):
        complaint = serializer.save()
        push_role_notification(
            role_names=("Cadet", "Administrator"),
            case_obj=complaint.case,
            exclude_user_id=self.request.user.id,
            message=f"شکایت جدید #{complaint.id} ثبت شد و در صف بررسی کارآموز قرار گرفت.",
        )


@extend_schema_view(
    get=extend_schema(tags=["Complaints"], summary="Retrieve complaint"),
    patch=extend_schema(tags=["Complaints"], summary="Resubmit/patch complaint"),
)
class ComplaintRetrieveUpdateAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = ComplaintSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return complaint_queryset_for_user(self.request.user)

    def perform_update(self, serializer):
        complaint = self.get_object()
        user = self.request.user
        if not (is_police_staff(user) or complaint.submitter_id == user.id):
            raise PermissionDenied("Only the submitter or police roles can edit this complaint.")
        if complaint.submitter_id == user.id and complaint.status in {
            Complaint.Status.APPROVED,
            Complaint.Status.REJECTED,
            Complaint.Status.VOID,
        }:
            raise ValidationError({"detail": "Finalized complaints cannot be edited by submitter."})
        updated = serializer.save()
        if complaint.submitter_id == user.id and complaint.status in {Complaint.Status.RETURNED, Complaint.Status.SUBMITTED}:
            updated.status = Complaint.Status.SUBMITTED
            updated.save(update_fields=["status", "updated_at"])
            push_role_notification(
                role_names=("Cadet", "Administrator"),
                case_obj=updated.case,
                exclude_user_id=user.id,
                message=f"شکایت #{updated.id} توسط شاکی اصلاح و مجددا برای بررسی کارآموز ارسال شد.",
            )


@extend_schema(
    tags=["Complaints"],
    summary="Add additional complainants",
    request=AddComplainantsSerializer,
    responses={200: ComplaintSerializer},
)
class ComplaintAddComplainantsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, complaint_id):
        if not has_any_role(request.user, "Cadet", "Administrator", "Police Officer", "Patrol Officer"):
            raise PermissionDenied("Only cadet/officer level users can add complainants.")

        complaint = get_object_or_404(Complaint, id=complaint_id)
        serializer = AddComplainantsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        to_add = []
        for complainant_user in serializer.validated_data["complainant_ids"]:
            if complainant_user.id == complaint.submitter_id:
                continue
            to_add.append(complainant_user)
            secondary, _ = SecondaryComplainant.objects.get_or_create(
                complaint=complaint,
                user=complainant_user,
            )
            secondary.status = SecondaryComplainant.Status.APPROVED
            secondary.reviewed_by = request.user
            secondary.review_message = ""
            secondary.save(update_fields=["status", "reviewed_by", "review_message", "updated_at"])
            if complainant_user.id != request.user.id:
                push_notification(
                    recipient=complainant_user,
                    case_obj=complaint.case,
                    message=f"شما به‌عنوان شاکی پرونده/شکایت #{complaint.id} اضافه شدید.",
                )

        if to_add:
            complaint.complainants.add(*to_add)
        if complaint.case_id:
            complaint.case.complainants.add(*complaint.complainants.all())
        return Response(ComplaintSerializer(complaint, context={"request": request}).data)


@extend_schema(
    tags=["Complaints"],
    summary="List secondary complainants",
    request=None,
    responses={200: SecondaryComplainantSerializer(many=True)},
)
class ComplaintSecondaryComplainantListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, complaint_id):
        complaint = get_object_or_404(complaint_queryset_for_user(request.user), id=complaint_id)
        entries = complaint.secondary_complainants.select_related("user", "requested_by", "reviewed_by").all()
        return Response(SecondaryComplainantSerializer(entries, many=True).data)


@extend_schema(
    tags=["Complaints"],
    summary="Submit secondary complainant request",
    request=SecondaryComplainantRequestSerializer,
    responses={200: SecondaryComplainantSerializer(many=True)},
)
class ComplaintSecondaryComplainantRequestAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, complaint_id):
        complaint = get_object_or_404(Complaint, id=complaint_id)
        if complaint.submitter_id != request.user.id:
            raise PermissionDenied("Only the complaint submitter can request secondary complainants.")

        serializer = SecondaryComplainantRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        results = []
        for complainant_user in serializer.validated_data["complainant_ids"]:
            if complainant_user.id == complaint.submitter_id:
                continue
            entry, _ = SecondaryComplainant.objects.get_or_create(
                complaint=complaint,
                user=complainant_user,
                defaults={"requested_by": request.user},
            )
            if entry.status != SecondaryComplainant.Status.APPROVED:
                entry.status = SecondaryComplainant.Status.PENDING
                entry.requested_by = request.user
                entry.reviewed_by = None
                entry.review_message = ""
                entry.save(
                    update_fields=[
                        "status",
                        "requested_by",
                        "reviewed_by",
                        "review_message",
                        "updated_at",
                    ]
                )
            if complainant_user.id != request.user.id:
                push_notification(
                    recipient=complainant_user,
                    case_obj=complaint.case,
                    message=f"برای شما درخواست شاکی فرعی در شکایت #{complaint.id} ثبت شد.",
                )
            results.append(entry)

        if results:
            push_role_notification(
                role_names=("Cadet", "Administrator"),
                case_obj=complaint.case,
                exclude_user_id=request.user.id,
                message=f"شکایت #{complaint.id} دارای درخواست جدید شاکی فرعی است و نیاز به بررسی کارآموز دارد.",
            )

        return Response(SecondaryComplainantSerializer(results, many=True).data)


@extend_schema(
    tags=["Complaints"],
    summary="Cadet approves/rejects a secondary complainant",
    request=SecondaryComplainantReviewSerializer,
    responses={200: OpenApiTypes.OBJECT},
)
class ComplaintSecondaryComplainantReviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, complaint_id, entry_id):
        if not has_any_role(request.user, "Cadet", "Administrator"):
            raise PermissionDenied("Only cadet-level roles can review secondary complainants.")

        complaint = get_object_or_404(Complaint, id=complaint_id)
        entry = get_object_or_404(
            SecondaryComplainant.objects.select_related("user"),
            id=entry_id,
            complaint=complaint,
        )
        serializer = SecondaryComplainantReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data["decision"]
        message = serializer.validated_data.get("message", "")

        if decision == "approved":
            entry.status = SecondaryComplainant.Status.APPROVED
            complaint.complainants.add(entry.user)
            if complaint.case_id:
                complaint.case.complainants.add(entry.user)
        else:
            entry.status = SecondaryComplainant.Status.REJECTED
            complaint.complainants.remove(entry.user)
            if complaint.case_id:
                complaint.case.complainants.remove(entry.user)

        entry.reviewed_by = request.user
        entry.review_message = message
        entry.save(update_fields=["status", "reviewed_by", "review_message", "updated_at"])

        if decision == "approved":
            push_notification(
                recipient=entry.user,
                case_obj=complaint.case,
                message=(
                    f"درخواست شاکی فرعی شما در شکایت #{complaint.id} تایید شد."
                    f"{' توضیح: ' + message if message else ''}"
                ),
            )
            if complaint.submitter_id != request.user.id:
                push_notification(
                    recipient=complaint.submitter,
                    case_obj=complaint.case,
                    message=(
                        f"شاکی فرعی {entry.user.username} برای شکایت #{complaint.id} تایید شد."
                        f"{' توضیح: ' + message if message else ''}"
                    ),
                )
        else:
            push_notification(
                recipient=entry.user,
                case_obj=complaint.case,
                message=(
                    f"درخواست شاکی فرعی شما در شکایت #{complaint.id} رد شد."
                    f"{' توضیح: ' + message if message else ''}"
                ),
            )
            if complaint.submitter_id != request.user.id:
                push_notification(
                    recipient=complaint.submitter,
                    case_obj=complaint.case,
                    message=(
                        f"شاکی فرعی {entry.user.username} برای شکایت #{complaint.id} رد شد."
                        f"{' توضیح: ' + message if message else ''}"
                    ),
                )

        return Response(
            {
                "entry": SecondaryComplainantSerializer(entry).data,
                "complaint": ComplaintSerializer(complaint, context={"request": request}).data,
            }
        )


@extend_schema(
    tags=["Complaints"],
    summary="Cadet review complaint",
    request=ComplaintDecisionSerializer,
    responses={200: OpenApiTypes.OBJECT},
)
class ComplaintCadetReviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, complaint_id):
        if not has_any_role(request.user, "Cadet", "Administrator"):
            raise PermissionDenied("Only cadet-level roles can perform this review.")

        complaint = get_object_or_404(Complaint, id=complaint_id)
        if complaint.status in {
            Complaint.Status.APPROVED,
            Complaint.Status.REJECTED,
            Complaint.Status.VOID,
        }:
            raise ValidationError({"detail": "This complaint is finalized and cannot be reviewed."})
        serializer = ComplaintDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data["decision"]
        message = serializer.validated_data.get("message", "")

        review = ComplaintReview(
            complaint=complaint,
            reviewer=request.user,
            step=ComplaintReview.Step.CADET,
            decision=decision,
            message=message,
        )
        review.save()

        if decision == ComplaintReview.Decision.RETURNED:
            complaint.register_invalid_attempt()
            if complaint.case_id:
                complaint.case.status = (
                    Case.Status.VOID if complaint.status == Complaint.Status.VOID else Case.Status.NEEDS_COMPLAINANT_UPDATE
                )
                complaint.case.save(update_fields=["status", "updated_at"])
            push_notification(
                recipient=complaint.submitter,
                case_obj=complaint.case,
                message=(
                    f"شکایت #{complaint.id} توسط کارآموز برای تکمیل برگشت داده شد."
                    f"{' توضیح: ' + message if message else ''}"
                ),
            )
        elif decision == ComplaintReview.Decision.REJECTED:
            complaint.status = Complaint.Status.REJECTED
            complaint.save(update_fields=["status", "updated_at"])
            if complaint.case_id:
                complaint.case.status = Case.Status.VOID
                complaint.case.save(update_fields=["status", "updated_at"])
            push_notification(
                recipient=complaint.submitter,
                case_obj=complaint.case,
                message=(
                    f"شکایت #{complaint.id} توسط کارآموز رد شد."
                    f"{' توضیح: ' + message if message else ''}"
                ),
            )
        else:
            # Cadet approval only advances the complaint to officer review.
            # Case creation must happen only after officer approval.
            complaint.status = Complaint.Status.SUBMITTED
            complaint.save(update_fields=["status", "updated_at"])
            if complaint.case_id:
                complaint.case.status = Case.Status.PENDING_OFFICER
                complaint.case.save(update_fields=["status", "updated_at"])
            push_notification(
                recipient=complaint.submitter,
                case_obj=complaint.case,
                message=(
                    f"شکایت #{complaint.id} توسط کارآموز تایید شد و برای بررسی افسر ارسال شد."
                    f"{' توضیح: ' + message if message else ''}"
                ),
            )
            push_role_notification(
                role_names=OFFICER_APPROVAL_ROLES,
                case_obj=complaint.case,
                exclude_user_id=request.user.id,
                message=f"شکایت #{complaint.id} پس از تایید کارآموز در صف بررسی افسر قرار گرفت.",
            )

        return Response(
            {
                "complaint": ComplaintSerializer(complaint, context={"request": request}).data,
                "review": ComplaintReviewSerializer(review).data,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Complaints"],
    summary="Officer review complaint",
    request=ComplaintDecisionSerializer,
    responses={200: OpenApiTypes.OBJECT},
)
class ComplaintOfficerReviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, complaint_id):
        if not has_any_role(
            request.user,
            "Police Officer",
            "Patrol Officer",
            "Sergeant",
            "Captain",
            "Chief",
            "Administrator",
        ):
            raise PermissionDenied("Only officer+ roles can perform this review.")

        complaint = get_object_or_404(Complaint, id=complaint_id)
        if complaint.status in {
            Complaint.Status.APPROVED,
            Complaint.Status.REJECTED,
            Complaint.Status.VOID,
        }:
            raise ValidationError({"detail": "This complaint is finalized and cannot be reviewed."})
        serializer = ComplaintDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data["decision"]
        message = serializer.validated_data.get("message", "")

        if (
            decision == ComplaintReview.Decision.APPROVED
            and complaint.case
            and complaint.case.severity == Case.Severity.CRITICAL
            and not has_any_role(request.user, "Chief", "Administrator")
        ):
            raise PermissionDenied("Only chief can approve critical complaints.")

        review = ComplaintReview(
            complaint=complaint,
            reviewer=request.user,
            step=ComplaintReview.Step.OFFICER,
            decision=decision,
            message=message,
        )
        review.save()

        case_obj = complaint.case
        if decision == ComplaintReview.Decision.APPROVED:
            case_obj = ensure_case_from_complaint(complaint)
            complaint.status = Complaint.Status.APPROVED
            complaint.save(update_fields=["status", "updated_at"])
            case_obj.status = Case.Status.OPEN
            case_obj.approved_by = request.user
            case_obj.save(update_fields=["status", "approved_by", "updated_at"])
            promote_complaint_attachments_to_case_evidence(complaint, case_obj)
            push_notification(
                recipient=complaint.submitter,
                case_obj=case_obj,
                message=(
                    f"شکایت #{complaint.id} توسط افسر تایید شد و پرونده #{case_obj.id} ایجاد/فعال شد."
                    f"{' توضیح: ' + message if message else ''}"
                ),
            )
            cadet_review = latest_reviewer_for_step(complaint, ComplaintReview.Step.CADET)
            if cadet_review and cadet_review.reviewer_id != request.user.id:
                push_notification(
                    recipient=cadet_review.reviewer,
                    case_obj=case_obj,
                    message=f"شکایت #{complaint.id} پس از بررسی افسر تایید نهایی شد.",
                )
        elif decision == ComplaintReview.Decision.RETURNED:
            complaint.status = Complaint.Status.RETURNED
            complaint.save(update_fields=["status", "updated_at"])
            if case_obj:
                case_obj.status = Case.Status.PENDING_CADET
                case_obj.save(update_fields=["status", "updated_at"])
            cadet_review = latest_reviewer_for_step(complaint, ComplaintReview.Step.CADET)
            if cadet_review and cadet_review.reviewer_id != request.user.id:
                push_notification(
                    recipient=cadet_review.reviewer,
                    case_obj=case_obj,
                    message=(
                        f"پرونده/شکایت #{complaint.id} توسط افسر برگشت داده شد و نیاز به بررسی مجدد کارآموز دارد."
                        f"{' توضیح: ' + message if message else ''}"
                    ),
                )
            if complaint.submitter_id != request.user.id:
                push_notification(
                    recipient=complaint.submitter,
                    case_obj=case_obj,
                    message=(
                        f"شکایت #{complaint.id} توسط افسر برگشت داده شد و در صف بررسی مجدد قرار گرفت."
                        f"{' توضیح: ' + message if message else ''}"
                    ),
                )
        else:
            complaint.status = Complaint.Status.REJECTED
            complaint.save(update_fields=["status", "updated_at"])
            if case_obj:
                case_obj.status = Case.Status.VOID
                case_obj.save(update_fields=["status", "updated_at"])
            cadet_review = latest_reviewer_for_step(complaint, ComplaintReview.Step.CADET)
            if cadet_review and cadet_review.reviewer_id != request.user.id:
                push_notification(
                    recipient=cadet_review.reviewer,
                    case_obj=case_obj,
                    message=(
                        f"شکایت #{complaint.id} توسط افسر رد نهایی شد."
                        f"{' توضیح: ' + message if message else ''}"
                    ),
                )
            push_notification(
                recipient=complaint.submitter,
                case_obj=case_obj,
                message=(
                    f"شکایت #{complaint.id} توسط افسر رد شد."
                    f"{' توضیح: ' + message if message else ''}"
                ),
            )

        return Response(
            {
                "case": CaseSerializer(case_obj, context={"request": request}).data if case_obj else None,
                "complaint": ComplaintSerializer(complaint, context={"request": request}).data,
                "review": ComplaintReviewSerializer(review).data,
            }
        )


@extend_schema(
    tags=["Cases"],
    summary="Create case from crime-scene report",
    request=CrimeSceneCaseCreateSerializer,
    responses={201: CaseSerializer},
)
class CrimeSceneCaseCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not has_any_role(
            request.user,
            "Police Officer",
            "Patrol Officer",
            "Detective",
            "Sergeant",
            "Captain",
            "Chief",
            "Administrator",
        ):
            raise PermissionDenied("Only police roles can create a crime-scene case.")

        serializer = CrimeSceneCaseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        witness_ids = serializer.validated_data.pop("witness_ids", [])
        local_witnesses = serializer.validated_data.pop("local_witnesses", [])

        case_obj = Case.objects.create(
            source_type=Case.SourceType.CRIME_SCENE,
            created_by=request.user,
            status=Case.Status.OPEN if has_any_role(request.user, "Chief", "Administrator") else Case.Status.PENDING_OFFICER,
            approved_by=request.user if has_any_role(request.user, "Chief", "Administrator") else None,
            **serializer.validated_data,
        )
        if witness_ids:
            case_obj.witnesses.set(witness_ids)
        for witness_data in local_witnesses:
            CrimeSceneWitness.objects.get_or_create(
                case=case_obj,
                national_id=witness_data["national_id"],
                phone_number=witness_data["phone_number"],
                defaults={"full_name": witness_data.get("full_name", "")},
            )

        if case_obj.status == Case.Status.PENDING_OFFICER:
            push_role_notification(
                role_names=OFFICER_APPROVAL_ROLES,
                case_obj=case_obj,
                exclude_user_id=request.user.id,
                message=f"پرونده صحنه جرم #{case_obj.id} ثبت شد و منتظر تایید مافوق است.",
            )

        return Response(CaseSerializer(case_obj, context={"request": request}).data, status=status.HTTP_201_CREATED)


@extend_schema(
    tags=["Cases"],
    summary="Approve crime-scene case by superior",
    request=None,
    responses={200: CaseSerializer},
)
class CrimeSceneCaseApproveAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, case_id):
        if not has_any_role(
            request.user,
            "Police Officer",
            "Patrol Officer",
            "Sergeant",
            "Captain",
            "Chief",
            "Administrator",
        ):
            raise PermissionDenied("Only officer+ roles can approve a crime-scene case.")

        case_obj = get_object_or_404(Case, id=case_id, source_type=Case.SourceType.CRIME_SCENE)
        if case_obj.severity == Case.Severity.CRITICAL and not has_any_role(request.user, "Chief", "Administrator"):
            raise PermissionDenied("Only chief can approve critical crime-scene cases.")
        case_obj.status = Case.Status.OPEN
        case_obj.approved_by = request.user
        case_obj.save(update_fields=["status", "approved_by", "updated_at"])
        if case_obj.created_by_id != request.user.id:
            push_notification(
                recipient=case_obj.created_by,
                case_obj=case_obj,
                message=f"پرونده صحنه جرم #{case_obj.id} توسط مافوق تایید شد.",
            )
        return Response(CaseSerializer(case_obj, context={"request": request}).data)


@extend_schema(tags=["Board"], summary="Get detective board for case", responses={200: DetectiveBoardSerializer})
class DetectiveBoardDetailAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, case_id):
        case_obj = get_object_or_404(Case, id=case_id)
        if not can_access_case(request.user, case_obj):
            raise PermissionDenied("You cannot access this case.")

        board = getattr(case_obj, "board", None)
        if board is None:
            if not has_any_role(request.user, "Detective", "Administrator"):
                raise ValidationError("Board is not initialized for this case.")
            board = ensure_board_for_case(case_obj, request.user)
        return Response(DetectiveBoardSerializer(board).data)


@extend_schema_view(
    get=extend_schema(tags=["Board"], summary="List board items", responses={200: BoardItemSerializer(many=True)}),
    post=extend_schema(tags=["Board"], summary="Create board item", request=BoardItemSerializer, responses={201: BoardItemSerializer}),
)
class BoardItemListCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, case_id):
        case_obj = get_object_or_404(Case, id=case_id)
        if not can_access_case(request.user, case_obj):
            raise PermissionDenied("You cannot access this case.")
        board = getattr(case_obj, "board", None)
        if board is None:
            return Response([], status=status.HTTP_200_OK)
        return Response(BoardItemSerializer(board.items.all(), many=True).data)

    def post(self, request, case_id):
        case_obj = get_object_or_404(Case, id=case_id)
        if not has_any_role(request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can manage board items.")
        ensure_detective_case_access(request.user, case_obj)
        if is_board_structure_locked(case_obj):
            raise PermissionDenied("Board structure is locked for this case status.")
        board = ensure_board_for_case(case_obj, request.user)

        serializer = BoardItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        evidence = serializer.validated_data.get("evidence")
        if evidence and evidence.officer_review_status != evidence.OfficerReviewStatus.APPROVED:
            raise ValidationError(
                {"evidence": "Evidence must be approved by officer before adding to detective board."}
            )
        if evidence and evidence.type == "bio_medical":
            bio = getattr(evidence, "bio_medical", None)
            if not bio or bio.validation_status != "accepted":
                raise ValidationError(
                    {"evidence": "Bio/medical evidence can be added to board only after coroner acceptance."}
                )

        serializer.save(board=board)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Board"], summary="Update/delete board item")
class BoardItemRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = BoardItem.objects.select_related("board", "board__case")
    serializer_class = BoardItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_update(self, serializer):
        if not has_any_role(self.request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can update board items.")
        case_obj = serializer.instance.board.case
        ensure_detective_case_access(self.request.user, case_obj)
        changed_fields = set(serializer.validated_data.keys())
        if is_board_structure_locked(case_obj):
            if not can_move_board_items(case_obj):
                raise PermissionDenied("Board item updates are locked for this case status.")
            if not changed_fields.issubset({"position_x", "position_y"}):
                raise PermissionDenied("Only board item position can be changed in this case status.")
        serializer.save()

    def perform_destroy(self, instance):
        if not has_any_role(self.request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can delete board items.")
        ensure_detective_case_access(self.request.user, instance.board.case)
        if is_board_structure_locked(instance.board.case):
            raise PermissionDenied("Board structure is locked for this case status.")
        instance.delete()


@extend_schema_view(
    get=extend_schema(tags=["Board"], summary="List board links", responses={200: BoardLinkSerializer(many=True)}),
    post=extend_schema(tags=["Board"], summary="Create board link", request=BoardLinkSerializer, responses={201: BoardLinkSerializer}),
)
class BoardLinkListCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, case_id):
        case_obj = get_object_or_404(Case, id=case_id)
        if not can_access_case(request.user, case_obj):
            raise PermissionDenied("You cannot access this case.")
        board = getattr(case_obj, "board", None)
        if board is None:
            return Response([], status=status.HTTP_200_OK)
        return Response(BoardLinkSerializer(board.links.all(), many=True).data)

    def post(self, request, case_id):
        case_obj = get_object_or_404(Case, id=case_id)
        if not has_any_role(request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can manage board links.")
        ensure_detective_case_access(request.user, case_obj)
        if is_board_structure_locked(case_obj):
            raise PermissionDenied("Board structure is locked for this case status.")
        board = ensure_board_for_case(case_obj, request.user)
        serializer = BoardLinkSerializer(data=request.data, context={"board": board})
        serializer.is_valid(raise_exception=True)
        serializer.save(board=board)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Board"], summary="Delete board link")
class BoardLinkDestroyAPIView(generics.DestroyAPIView):
    queryset = BoardLink.objects.select_related("board", "board__case")
    serializer_class = BoardLinkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_destroy(self, instance):
        if not has_any_role(self.request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can delete board links.")
        ensure_detective_case_access(self.request.user, instance.board.case)
        if is_board_structure_locked(instance.board.case):
            raise PermissionDenied("Board structure is locked for this case status.")
        instance.delete()


@extend_schema_view(
    get=extend_schema(tags=["Board"], summary="List board connections", responses={200: BoardConnectionSerializer(many=True)}),
    post=extend_schema(tags=["Board"], summary="Create board connection", request=BoardConnectionSerializer, responses={201: BoardConnectionSerializer}),
)
class BoardConnectionListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = BoardConnectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return BoardConnection.objects.select_related("board", "from_evidence", "to_evidence").filter(
            board__case_id=self.kwargs["case_id"]
        )

    def list(self, request, *args, **kwargs):
        case_obj = get_object_or_404(Case, id=self.kwargs["case_id"])
        if not can_access_case(request.user, case_obj):
            raise PermissionDenied("You cannot access this case.")
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        if not has_any_role(self.request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can manage board connections.")
        case_obj = get_object_or_404(Case, id=self.kwargs["case_id"])
        ensure_detective_case_access(self.request.user, case_obj)
        if is_board_structure_locked(case_obj):
            raise PermissionDenied("Board structure is locked for this case status.")
        board = ensure_board_for_case(case_obj, self.request.user)
        serializer.save(board=board)


@extend_schema(tags=["Board"], summary="Delete board connection")
class BoardConnectionDestroyAPIView(generics.DestroyAPIView):
    queryset = BoardConnection.objects.select_related("board", "board__case")
    serializer_class = BoardConnectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_destroy(self, instance):
        if not has_any_role(self.request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can delete board connections.")
        ensure_detective_case_access(self.request.user, instance.board.case)
        if is_board_structure_locked(instance.board.case):
            raise PermissionDenied("Board structure is locked for this case status.")
        instance.delete()


@extend_schema(
    tags=["Interrogation"],
    summary="Detective nominates suspects",
    request=SuspectNominationSerializer,
    responses={200: SuspectCaseProfileSerializer(many=True)},
)
class SuspectNominationAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, case_id):
        if not has_any_role(request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can nominate suspects.")

        case_obj = get_object_or_404(Case, id=case_id)
        ensure_detective_case_access(request.user, case_obj)
        serializer = SuspectNominationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        suspect_ids = serializer.validated_data["suspect_ids"]
        summary = serializer.validated_data.get("summary", "")

        case_obj.suspects.add(*suspect_ids)
        profiles = []
        for suspect in suspect_ids:
            profile, _ = SuspectCaseProfile.objects.get_or_create(case=case_obj, suspect=suspect)
            profiles.append(profile)

        case_obj.status = Case.Status.WARRANT_PENDING
        case_obj.save(update_fields=["status", "updated_at"])
        CaseLog.objects.create(case=case_obj, actor=request.user, action="suspects_nominated", description=summary)
        push_role_notification(
            role_names=("Sergeant", "Administrator"),
            case_obj=case_obj,
            exclude_user_id=request.user.id,
            message=(
                f"کارآگاه برای پرونده #{case_obj.id} مظنون معرفی کرد و منتظر تصمیم گروهبان است."
                f"{' توضیح: ' + summary if summary else ''}"
            ),
        )

        return Response(SuspectCaseProfileSerializer(profiles, many=True).data)


@extend_schema(
    tags=["Interrogation"],
    summary="Sergeant approves or rejects nominated suspects",
    request=SergeantDecisionSerializer,
    responses={200: OpenApiTypes.OBJECT},
)
class SergeantDecisionAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, case_id):
        if not has_any_role(request.user, "Sergeant", "Administrator"):
            raise PermissionDenied("Only sergeant role can confirm or reject.")

        case_obj = get_object_or_404(Case, id=case_id)
        serializer = SergeantDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        approved = serializer.validated_data["approved"]
        message = serializer.validated_data.get("message", "")

        case_obj.status = Case.Status.WARRANT_PENDING if approved else Case.Status.OPEN
        case_obj.save(update_fields=["status", "updated_at"])

        for profile in case_obj.suspect_profiles.all():
            profile.arrest_warrant_issued = approved
            profile.save(update_fields=["arrest_warrant_issued", "severe_tracking"])

        CaseLog.objects.create(
            case=case_obj,
            actor=request.user,
            action="sergeant_decision",
            description=message or ("approved" if approved else "rejected"),
        )
        detective_user = get_case_detective(case_obj)
        if detective_user and detective_user.id != request.user.id:
            if approved:
                push_notification(
                    recipient=detective_user,
                    case_obj=case_obj,
                    message=(
                        f"مظنون‌های معرفی‌شده در پرونده #{case_obj.id} توسط گروهبان تایید شدند."
                        f"{' توضیح: ' + message if message else ''}"
                    ),
                )
            else:
                push_notification(
                    recipient=detective_user,
                    case_obj=case_obj,
                    message=(
                        f"درخواست معرفی مظنون برای پرونده #{case_obj.id} توسط گروهبان رد شد و پرونده به کارآگاه برگشت."
                        f"{' توضیح: ' + message if message else ''}"
                    ),
                )
        if approved:
            push_role_notification(
                role_names=("Police Officer", "Patrol Officer", "Administrator"),
                case_obj=case_obj,
                exclude_user_id=request.user.id,
                message=f"حکم دستگیری مظنون‌های پرونده #{case_obj.id} صادر شد و پرونده آماده عملیات دستگیری است.",
            )
            for profile in case_obj.suspect_profiles.select_related("suspect").all():
                if profile.suspect_id != request.user.id:
                    push_notification(
                        recipient=profile.suspect,
                        case_obj=case_obj,
                        message=f"شما به‌عنوان مظنون در پرونده #{case_obj.id} تحت پیگرد رسمی قرار گرفتید.",
                    )
        return Response({"case_id": case_obj.id, "approved": approved, "message": message})


@extend_schema_view(
    post=extend_schema(
        tags=["Interrogation"],
        summary="Mark suspect as arrested",
        request=None,
        responses={200: SuspectCaseProfileSerializer},
    )
)
class SuspectArrestAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, profile_id):
        if not has_any_role(request.user, "Police Officer", "Patrol Officer", "Sergeant", "Administrator"):
            raise PermissionDenied("Only police roles can register arrests.")

        profile = get_object_or_404(SuspectCaseProfile, id=profile_id)
        profile.is_arrested = True
        profile.save(update_fields=["is_arrested", "severe_tracking"])
        case_obj = profile.case
        case_obj.status = Case.Status.ARRESTED
        case_obj.save(update_fields=["status", "updated_at"])

        detective_user = get_case_detective(case_obj)
        if detective_user and detective_user.id != request.user.id:
            push_notification(
                recipient=detective_user,
                case_obj=case_obj,
                message=f"یکی از مظنون‌های پرونده #{case_obj.id} دستگیر شد.",
            )
        if profile.suspect_id != request.user.id:
            push_notification(
                recipient=profile.suspect,
                case_obj=case_obj,
                message=f"وضعیت شما در پرونده #{case_obj.id} به «بازداشت‌شده» تغییر کرد.",
            )
        push_role_notification(
            role_names=("Sergeant", "Captain", "Administrator"),
            case_obj=case_obj,
            exclude_user_id=request.user.id,
            message=f"بازداشت مظنون در پرونده #{case_obj.id} ثبت شد.",
        )
        return Response(SuspectCaseProfileSerializer(profile).data)


@extend_schema(
    tags=["Interrogation"],
    summary="Submit interrogation score",
    request=InterrogationScoreSerializer,
    responses={201: InterrogationScoreSerializer},
)
class InterrogationScoreCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, profile_id):
        profile = get_object_or_404(SuspectCaseProfile, id=profile_id)
        case_obj = profile.case
        serializer = InterrogationScoreSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        scorer_role = serializer.validated_data["scorer_role"]
        if scorer_role == InterrogationScore.ScorerRole.DETECTIVE and not has_any_role(request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detectives can submit detective score.")
        if scorer_role == InterrogationScore.ScorerRole.DETECTIVE:
            ensure_detective_case_access(request.user, case_obj)
        if scorer_role == InterrogationScore.ScorerRole.SERGEANT and not has_any_role(
            request.user, "Sergeant", "Administrator"
        ):
            raise PermissionDenied("Only sergeant can submit sergeant score.")

        score = serializer.save(suspect_profile=profile, scorer=request.user)
        if scorer_role == InterrogationScore.ScorerRole.DETECTIVE:
            push_role_notification(
                role_names=("Sergeant", "Administrator"),
                case_obj=case_obj,
                exclude_user_id=request.user.id,
                message=f"امتیاز بازجویی کارآگاه برای مظنون پرونده #{case_obj.id} ثبت شد و منتظر امتیاز گروهبان است.",
            )
        else:
            detective_user = get_case_detective(case_obj)
            if detective_user and detective_user.id != request.user.id:
                push_notification(
                    recipient=detective_user,
                    case_obj=case_obj,
                    message=f"امتیاز بازجویی گروهبان برای مظنون پرونده #{case_obj.id} ثبت شد.",
                )

        has_detective_score = profile.scores.filter(
            scorer_role=InterrogationScore.ScorerRole.DETECTIVE
        ).exists()
        has_sergeant_score = profile.scores.filter(
            scorer_role=InterrogationScore.ScorerRole.SERGEANT
        ).exists()
        if has_detective_score and has_sergeant_score:
            push_role_notification(
                role_names=("Sergeant", "Administrator"),
                case_obj=case_obj,
                exclude_user_id=request.user.id,
                message=f"امتیازهای بازجویی مظنون پرونده #{case_obj.id} کامل شد و پرونده آماده ارسال به کاپیتان است.",
            )
        return Response(InterrogationScoreSerializer(score).data, status=status.HTTP_201_CREATED)


@extend_schema(
    tags=["Interrogation"],
    summary="Captain decision for prosecution",
    request=CaptainDecisionCreateSerializer,
    responses={201: CaptainDecisionSerializer},
)
class CaptainDecisionCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, profile_id):
        profile = get_object_or_404(SuspectCaseProfile, id=profile_id)
        case_obj = profile.case
        if case_obj.severity == Case.Severity.CRITICAL:
            if not has_any_role(request.user, "Captain", "Chief", "Administrator"):
                raise PermissionDenied("Only captain/chief roles can submit this decision for critical cases.")
        else:
            if not has_any_role(request.user, "Captain", "Administrator"):
                raise PermissionDenied("Only captain role can submit this decision.")

        serializer = CaptainDecisionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        is_confirmed = serializer.validated_data["is_confirmed"]
        summary = serializer.validated_data.get("summary", "")

        decision = CaptainDecision.objects.create(
            suspect_profile=profile,
            captain=request.user,
            is_confirmed=is_confirmed,
            summary=summary,
        )
        submitter_user = latest_submitter_to_captain(case_obj)
        detective_user = get_case_detective(case_obj)

        if case_obj.severity == Case.Severity.CRITICAL and has_any_role(request.user, "Chief", "Administrator"):
            decision.chief = request.user
            decision.chief_confirmed = is_confirmed
            decision.save(update_fields=["chief", "chief_confirmed"])
            case_obj.status = Case.Status.IN_COURT if is_confirmed else Case.Status.ARRESTED
            CaseLog.objects.create(
                case=case_obj,
                actor=request.user,
                action="chief_auto_decision",
                description="critical case finalized by chief role at captain step",
            )
            if submitter_user and submitter_user.id != request.user.id:
                push_notification(
                    recipient=submitter_user,
                    case_obj=case_obj,
                    message=(
                        f"پرونده بحرانی #{case_obj.id} توسط رئیس پلیس {'تایید' if is_confirmed else 'رد'} شد."
                        f"{' توضیح: ' + summary if summary else ''}"
                    ),
                )
            if detective_user and detective_user.id != request.user.id:
                push_notification(
                    recipient=detective_user,
                    case_obj=case_obj,
                    message=(
                        f"پرونده بحرانی #{case_obj.id} توسط رئیس پلیس {'تایید' if is_confirmed else 'رد'} شد."
                        f"{' توضیح: ' + summary if summary else ''}"
                    ),
                )
        elif case_obj.severity == Case.Severity.CRITICAL:
            if is_confirmed:
                case_obj.status = Case.Status.WAITING_CHIEF
                CaseLog.objects.create(
                    case=case_obj,
                    actor=request.user,
                    action="captain_escalate_chief",
                    description=summary or "Escalated to chief for critical confirmation.",
                )
                if submitter_user and submitter_user.id != request.user.id:
                    push_notification(
                        recipient=submitter_user,
                        case_obj=case_obj,
                        message=(
                            f"پرونده بحرانی #{case_obj.id} توسط کاپیتان تایید و برای رئیس پلیس ارسال شد."
                            f"{' توضیح: ' + summary if summary else ''}"
                        ),
                    )
                if detective_user and detective_user.id != request.user.id:
                    push_notification(
                        recipient=detective_user,
                        case_obj=case_obj,
                        message=(
                            f"پرونده بحرانی #{case_obj.id} توسط کاپیتان تایید و برای رئیس پلیس ارسال شد."
                            f"{' توضیح: ' + summary if summary else ''}"
                        ),
                    )
                push_role_notification(
                    role_names=("Chief", "Administrator"),
                    case_obj=case_obj,
                    exclude_user_id=request.user.id,
                    message=f"پرونده بحرانی #{case_obj.id} در صف تایید رئیس پلیس قرار گرفت.",
                )
            else:
                case_obj.status = Case.Status.ARRESTED
                CaseLog.objects.create(
                    case=case_obj,
                    actor=request.user,
                    action="captain_reject",
                    description=summary or "Returned to sergeant queue for review.",
                )
                if submitter_user and submitter_user.id != request.user.id:
                    push_notification(
                        recipient=submitter_user,
                        case_obj=case_obj,
                        message=(
                            f"پرونده #{case_obj.id} توسط کاپیتان رد شد و به صف گروهبان برگشت."
                            f"{' توضیح: ' + summary if summary else ''}"
                        ),
                    )
                if detective_user and detective_user.id != request.user.id:
                    push_notification(
                        recipient=detective_user,
                        case_obj=case_obj,
                        message=(
                            f"پرونده #{case_obj.id} توسط کاپیتان رد شد و به صف گروهبان برگشت."
                            f"{' توضیح: ' + summary if summary else ''}"
                        ),
                    )
        elif is_confirmed:
            case_obj.status = Case.Status.IN_COURT
            CaseLog.objects.create(
                case=case_obj,
                actor=request.user,
                action="captain_prosecute",
                description=summary or "Sent to court.",
            )
            if submitter_user and submitter_user.id != request.user.id:
                push_notification(
                    recipient=submitter_user,
                    case_obj=case_obj,
                    message=(
                        f"پرونده #{case_obj.id} توسط کاپیتان تایید و به دادگاه ارسال شد."
                        f"{' توضیح: ' + summary if summary else ''}"
                    ),
                )
            if detective_user and detective_user.id != request.user.id:
                push_notification(
                    recipient=detective_user,
                    case_obj=case_obj,
                    message=(
                        f"پرونده #{case_obj.id} توسط کاپیتان تایید و به دادگاه ارسال شد."
                        f"{' توضیح: ' + summary if summary else ''}"
                    ),
                )
        else:
            case_obj.status = Case.Status.ARRESTED
            CaseLog.objects.create(
                case=case_obj,
                actor=request.user,
                action="captain_reject",
                description=summary or "Returned to sergeant queue for review.",
            )
            if submitter_user and submitter_user.id != request.user.id:
                push_notification(
                    recipient=submitter_user,
                    case_obj=case_obj,
                    message=(
                        f"پرونده #{case_obj.id} توسط کاپیتان رد شد و به صف گروهبان برگشت."
                        f"{' توضیح: ' + summary if summary else ''}"
                    ),
                )
            if detective_user and detective_user.id != request.user.id:
                push_notification(
                    recipient=detective_user,
                    case_obj=case_obj,
                    message=(
                        f"پرونده #{case_obj.id} توسط کاپیتان رد شد و به صف گروهبان برگشت."
                        f"{' توضیح: ' + summary if summary else ''}"
                    ),
                )
        case_obj.save(update_fields=["status", "updated_at"])
        if case_obj.status == Case.Status.IN_COURT:
            push_role_notification(
                role_names=("Sergeant", "Administrator"),
                case_obj=case_obj,
                exclude_user_id=request.user.id,
                message=f"پرونده #{case_obj.id} با تایید کاپیتان/رئیس برای محاکمه به دادگاه ارسال شد.",
            )
        elif case_obj.status in {Case.Status.ARRESTED, Case.Status.WAITING_CHIEF}:
            push_role_notification(
                role_names=("Sergeant", "Administrator"),
                case_obj=case_obj,
                exclude_user_id=request.user.id,
                message=(
                    f"نتیجه تصمیم کاپیتان برای پرونده #{case_obj.id}: "
                    f"{'ارجاع به رئیس پلیس' if case_obj.status == Case.Status.WAITING_CHIEF else 'بازگشت برای پیگیری مجدد'}."
                ),
            )

        return Response(CaptainDecisionSerializer(decision).data, status=status.HTTP_201_CREATED)


@extend_schema(
    tags=["Interrogation"],
    summary="Chief confirmation for critical-case captain decision",
    request=ChiefDecisionSerializer,
    responses={200: CaptainDecisionSerializer},
)
class ChiefDecisionAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, decision_id):
        if not has_any_role(request.user, "Chief", "Administrator"):
            raise PermissionDenied("Only chief role can submit this decision.")

        decision = get_object_or_404(CaptainDecision.objects.select_related("suspect_profile__case"), id=decision_id)
        profile = decision.suspect_profile
        case_obj = profile.case

        if case_obj.severity != Case.Severity.CRITICAL:
            raise ValidationError({"decision_id": "Chief confirmation is only for critical cases."})

        serializer = ChiefDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision.chief = request.user
        decision.chief_confirmed = serializer.validated_data["chief_confirmed"]
        note = serializer.validated_data.get("summary", "")
        if note:
            decision.summary = f"{decision.summary}\nChief note: {note}".strip()
        decision.save(update_fields=["chief", "chief_confirmed", "summary"])
        submitter_user = latest_submitter_to_captain(case_obj)
        detective_user = get_case_detective(case_obj)

        if decision.is_confirmed and decision.chief_confirmed:
            case_obj.status = Case.Status.IN_COURT
            CaseLog.objects.create(
                case=case_obj,
                actor=request.user,
                action="chief_confirmed",
                description="Chief confirmed captain decision and sent to court.",
            )
            if decision.captain_id and decision.captain_id != request.user.id:
                push_notification(
                    recipient=decision.captain,
                    case_obj=case_obj,
                    message=(
                        f"تصمیم پرونده بحرانی #{case_obj.id} توسط رئیس پلیس تایید و به دادگاه ارسال شد."
                        f"{' توضیح: ' + note if note else ''}"
                    ),
                )
            if submitter_user and submitter_user.id != request.user.id:
                push_notification(
                    recipient=submitter_user,
                    case_obj=case_obj,
                    message=(
                        f"پرونده بحرانی #{case_obj.id} توسط رئیس پلیس تایید و به دادگاه ارسال شد."
                        f"{' توضیح: ' + note if note else ''}"
                    ),
                )
            if detective_user and detective_user.id != request.user.id:
                push_notification(
                    recipient=detective_user,
                    case_obj=case_obj,
                    message=(
                        f"پرونده بحرانی #{case_obj.id} توسط رئیس پلیس تایید و به دادگاه ارسال شد."
                        f"{' توضیح: ' + note if note else ''}"
                    ),
                )
        else:
            case_obj.status = Case.Status.ARRESTED
            CaseLog.objects.create(
                case=case_obj,
                actor=request.user,
                action="chief_rejected",
                description="Chief rejected captain decision and returned to sergeant queue.",
            )
            if decision.captain_id and decision.captain_id != request.user.id:
                push_notification(
                    recipient=decision.captain,
                    case_obj=case_obj,
                    message=(
                        f"تصمیم پرونده بحرانی #{case_obj.id} توسط رئیس پلیس رد شد و پرونده از دادگاه به صف گروهبان برگشت."
                        f"{' توضیح: ' + note if note else ''}"
                    ),
                )
            if submitter_user and submitter_user.id != request.user.id:
                push_notification(
                    recipient=submitter_user,
                    case_obj=case_obj,
                    message=(
                        f"پرونده بحرانی #{case_obj.id} توسط رئیس پلیس رد شد و به صف گروهبان برگشت."
                        f"{' توضیح: ' + note if note else ''}"
                    ),
                )
            if detective_user and detective_user.id != request.user.id:
                push_notification(
                    recipient=detective_user,
                    case_obj=case_obj,
                    message=(
                        f"پرونده بحرانی #{case_obj.id} توسط رئیس پلیس رد شد و به صف گروهبان برگشت."
                        f"{' توضیح: ' + note if note else ''}"
                    ),
                )
        case_obj.save(update_fields=["status", "updated_at"])
        push_role_notification(
            role_names=("Sergeant", "Administrator"),
            case_obj=case_obj,
            exclude_user_id=request.user.id,
            message=(
                f"نتیجه تصمیم رئیس پلیس برای پرونده بحرانی #{case_obj.id}: "
                f"{'تایید نهایی و ارجاع به دادگاه' if case_obj.status == Case.Status.IN_COURT else 'رد و بازگشت به فرآیند بازجویی'}."
            ),
        )

        return Response(CaptainDecisionSerializer(decision).data)


@extend_schema(
    tags=["Wanted"],
    summary="Mark suspect profile as wanted/public",
    request=WantedUpdateSerializer,
    responses={200: SuspectCaseProfileSerializer},
)
class SuspectWantedUpdateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, profile_id):
        if not is_police_staff(request.user):
            raise PermissionDenied("Only police roles can update wanted status.")

        profile = get_object_or_404(SuspectCaseProfile, id=profile_id)
        serializer = WantedUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        if "public_photo" in data:
            profile.public_photo = data["public_photo"]
        if "public_details" in data:
            profile.public_details = data["public_details"]
        profile.save()
        return Response(SuspectCaseProfileSerializer(profile).data)


@extend_schema(tags=["Wanted"], summary="List severe tracking suspects", responses={200: SuspectCaseProfileSerializer(many=True)})
class SevereTrackingListAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        profiles = list(SuspectCaseProfile.objects.select_related("suspect", "case").all())
        severe_profiles = []
        for profile in profiles:
            profile.severe_tracking = profile.is_severe_tracking
            profile.save(update_fields=["severe_tracking"])
            if profile.severe_tracking:
                severe_profiles.append(profile)

        severe_profiles.sort(key=lambda item: item.ranking_score, reverse=True)
        return Response(SuspectCaseProfileSerializer(severe_profiles, many=True).data)


@extend_schema(tags=["Notifications"], summary="Detective notification feed", responses={200: OpenApiTypes.OBJECT})
class DetectiveNotificationListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not has_any_role(request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective roles can access this feed.")
        case_ids = Case.objects.filter(accepted_detective=request.user).values_list("id", flat=True)
        notifications = CaseLog.objects.filter(case_id__in=case_ids, action="new_evidence").order_by("-timestamp")
        data = [
            {
                "id": log.id,
                "case_id": log.case_id,
                "action": log.action,
                "description": log.description,
                "timestamp": log.timestamp,
            }
            for log in notifications
        ]
        return Response(data)


@extend_schema(tags=["Notifications"], summary="List current user notifications", responses={200: NotificationSerializer(many=True)})
class NotificationListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        queryset = (
            Notification.objects.filter(recipient=request.user)
            .select_related("case", "evidence")
            .order_by("-created_at")
        )
        return Response(NotificationSerializer(queryset, many=True).data)


@extend_schema(tags=["Notifications"], summary="Mark single notification as read", responses={200: NotificationSerializer})
class NotificationMarkReadAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, notification_id):
        notification = get_object_or_404(Notification, id=notification_id, recipient=request.user)
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notification).data)


@extend_schema(tags=["Notifications"], summary="Mark all user notifications as read", responses={200: OpenApiTypes.OBJECT})
class NotificationMarkAllReadAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({"updated": updated})


@extend_schema(
    tags=["Interrogation"],
    summary="List suspect profiles (optionally filtered by case/arrest status)",
    request=None,
    responses={200: SuspectCaseProfileSerializer(many=True)},
)
class SuspectProfileListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_police_staff(request.user):
            raise PermissionDenied("Only police roles can view suspect profiles.")

        queryset = SuspectCaseProfile.objects.select_related("suspect", "case").all()

        case_id = request.query_params.get("case")
        if case_id and case_id.isdigit():
            queryset = queryset.filter(case_id=int(case_id))

        arrest_warrant_issued = request.query_params.get("arrest_warrant_issued")
        if arrest_warrant_issued is not None:
            normalized = arrest_warrant_issued.strip().lower()
            if normalized in {"true", "1", "yes"}:
                queryset = queryset.filter(arrest_warrant_issued=True)
            elif normalized in {"false", "0", "no"}:
                queryset = queryset.filter(arrest_warrant_issued=False)

        is_arrested = request.query_params.get("is_arrested")
        if is_arrested is not None:
            normalized = is_arrested.strip().lower()
            if normalized in {"true", "1", "yes"}:
                queryset = queryset.filter(is_arrested=True)
            elif normalized in {"false", "0", "no"}:
                queryset = queryset.filter(is_arrested=False)

        return Response(SuspectCaseProfileSerializer(queryset, many=True).data)


@extend_schema(
    tags=["Interrogation"],
    summary="Sergeant submits arrested case package to captain queue",
    request=SubmitToCaptainSerializer,
    responses={200: OpenApiTypes.OBJECT},
)
class SergeantSubmitToCaptainAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, case_id):
        if not has_any_role(request.user, "Sergeant", "Administrator"):
            raise PermissionDenied("Only sergeant role can submit a case to captain queue.")

        case_obj = get_object_or_404(Case, id=case_id)
        serializer = SubmitToCaptainSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.validated_data.get("message", "").strip()

        arrested_profiles = list(case_obj.suspect_profiles.filter(is_arrested=True))
        if not arrested_profiles:
            raise ValidationError({"detail": "At least one arrested suspect is required before captain handoff."})

        missing_scores = []
        for profile in arrested_profiles:
            has_detective_score = profile.scores.filter(scorer_role=InterrogationScore.ScorerRole.DETECTIVE).exists()
            has_sergeant_score = profile.scores.filter(scorer_role=InterrogationScore.ScorerRole.SERGEANT).exists()
            if not has_detective_score or not has_sergeant_score:
                missing_scores.append(
                    {
                        "profile_id": profile.id,
                        "suspect_id": profile.suspect_id,
                        "needs_detective_score": not has_detective_score,
                        "needs_sergeant_score": not has_sergeant_score,
                    }
                )

        if missing_scores:
            raise ValidationError(
                {
                    "detail": "All arrested suspects must have both detective and sergeant interrogation scores.",
                    "missing_profiles": missing_scores,
                }
            )

        case_obj.status = Case.Status.WAITING_CAPTAIN
        case_obj.save(update_fields=["status", "updated_at"])

        CaseLog.objects.create(
            case=case_obj,
            actor=request.user,
            action="submitted_to_captain",
            description=message or "Submitted by sergeant to captain queue.",
        )
        push_role_notification(
            role_names=("Captain", "Administrator"),
            case_obj=case_obj,
            exclude_user_id=request.user.id,
            message=f"پرونده #{case_obj.id} برای تصمیم نهایی در صف کاپیتان قرار گرفت.",
        )
        detective_user = get_case_detective(case_obj)
        if detective_user and detective_user.id != request.user.id:
            push_notification(
                recipient=detective_user,
                case_obj=case_obj,
                message=f"پرونده #{case_obj.id} توسط گروهبان برای تصمیم نهایی به صف کاپیتان ارسال شد.",
            )

        return Response(
            {
                "case": CaseSerializer(case_obj, context={"request": request}).data,
                "submitted_profiles": len(arrested_profiles),
                "message": message,
            }
        )


@extend_schema(tags=["Stats"], summary="Aggregated case statistics", responses={200: OpenApiTypes.OBJECT})
class AggregatedStatsAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        data = {
            "total_cases": Case.objects.count(),
            "active_cases": Case.objects.exclude(status__in=[Case.Status.CLOSED, Case.Status.VOID]).count(),
            "solved_cases": Case.objects.filter(status=Case.Status.CLOSED).count(),
            "staff_count": User.objects.filter(
                Q(is_superuser=True) | Q(groups__name__in=POLICE_ROLES)
            ).distinct().count(),
            "wanted_count": SuspectCaseProfile.objects.filter(
                is_arrested=False
            ).exclude(case__status__in=[Case.Status.CLOSED, Case.Status.VOID]).values("suspect_id").distinct().count(),
        }
        return Response(data)


@extend_schema(
    tags=["Stats"],
    summary="Breakdown statistics by severity and status",
    responses=BreakdownStatsSerializer,
)
class CaseBreakdownStatsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanViewAggregatedStats]

    def get(self, request):
        severity_rows = Case.objects.values("severity").annotate(total=Count("id"))
        status_rows = Case.objects.values("status").annotate(total=Count("id"))
        by_severity = {
            str(row["severity"]): row["total"] for row in severity_rows
        }
        by_status = {
            row["status"]: row["total"] for row in status_rows
        }
        serializer = BreakdownStatsSerializer(data={"by_severity": by_severity, "by_status": by_status})
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data)
