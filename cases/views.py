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
    Complaint,
    ComplaintReview,
    DetectiveBoard,
    InterrogationScore,
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
    ChiefDecisionSerializer,
    ComplaintDecisionSerializer,
    ComplaintReviewSerializer,
    ComplaintSerializer,
    CrimeSceneCaseCreateSerializer,
    DetectiveBoardSerializer,
    InterrogationScoreSerializer,
    SergeantDecisionSerializer,
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


def has_any_role(user, *roles):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    expected = set(roles)
    return any(role in expected for role in user.role_names)


def is_police_staff(user):
    return has_any_role(user, *POLICE_ROLES)


def can_access_case(user, case_obj):
    if is_police_staff(user) or has_any_role(user, "Judge", "Coroner"):
        return True
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
    if is_police_staff(user) or has_any_role(user, "Judge", "Coroner"):
        return base
    return base.filter(
        Q(created_by=user) | Q(complainants=user) | Q(witnesses=user) | Q(suspects=user)
    ).distinct()


def complaint_queryset_for_user(user):
    base = Complaint.objects.all().prefetch_related("complainants", "reviews")
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


@extend_schema_view(
    get=extend_schema(tags=["Complaints"], summary="List accessible complaints"),
    post=extend_schema(tags=["Complaints"], summary="Create complaint"),
)
class ComplaintListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = ComplaintSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return complaint_queryset_for_user(self.request.user)


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
        complaint.complainants.add(*serializer.validated_data["complainant_ids"])
        if complaint.case_id:
            complaint.case.complainants.add(*complaint.complainants.all())
        return Response(ComplaintSerializer(complaint, context={"request": request}).data)


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
        elif decision == ComplaintReview.Decision.REJECTED:
            complaint.status = Complaint.Status.REJECTED
            complaint.save(update_fields=["status", "updated_at"])
            if complaint.case_id:
                complaint.case.status = Case.Status.VOID
                complaint.case.save(update_fields=["status", "updated_at"])
        else:
            # Cadet approval only advances the complaint to officer review.
            # Case creation must happen only after officer approval.
            if complaint.case_id:
                complaint.case.status = Case.Status.PENDING_OFFICER
                complaint.case.save(update_fields=["status", "updated_at"])

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
        elif decision == ComplaintReview.Decision.RETURNED:
            complaint.status = Complaint.Status.RETURNED
            complaint.save(update_fields=["status", "updated_at"])
            if case_obj:
                case_obj.status = Case.Status.PENDING_CADET
                case_obj.save(update_fields=["status", "updated_at"])
        else:
            complaint.status = Complaint.Status.REJECTED
            complaint.save(update_fields=["status", "updated_at"])
            if case_obj:
                case_obj.status = Case.Status.VOID
                case_obj.save(update_fields=["status", "updated_at"])

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

        case_obj = Case.objects.create(
            source_type=Case.SourceType.CRIME_SCENE,
            created_by=request.user,
            status=Case.Status.OPEN if has_any_role(request.user, "Chief", "Administrator") else Case.Status.PENDING_OFFICER,
            approved_by=request.user if has_any_role(request.user, "Chief", "Administrator") else None,
            **serializer.validated_data,
        )
        if witness_ids:
            case_obj.witnesses.set(witness_ids)

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
        print("=" * 60)
        print("BoardItem Create Request Debug:")
        print(f"User: {request.user} (authenticated: {request.user.is_authenticated})")
        print(f"User roles: {getattr(request.user, 'role_names', [])}")
        print(f"Case ID: {case_id}")
        print(f"Request data: {request.data}")
        print("=" * 60)
        
        case_obj = get_object_or_404(Case, id=case_id)
        if not has_any_role(request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can manage board items.")
        board = ensure_board_for_case(case_obj, request.user)
        
        print(f"Board: {board.id}")
        
        serializer = BoardItemSerializer(data=request.data)
        if not serializer.is_valid():
            print("VALIDATION ERRORS:")
            print(serializer.errors)
            print("=" * 60)
        
        serializer.is_valid(raise_exception=True)
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
        serializer.save()

    def perform_destroy(self, instance):
        if not has_any_role(self.request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can delete board items.")
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

    def perform_create(self, serializer):
        if not has_any_role(self.request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective role can manage board connections.")
        case_obj = get_object_or_404(Case, id=self.kwargs["case_id"])
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
        serializer = InterrogationScoreSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        scorer_role = serializer.validated_data["scorer_role"]
        if scorer_role == InterrogationScore.ScorerRole.DETECTIVE and not has_any_role(request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detectives can submit detective score.")
        if scorer_role == InterrogationScore.ScorerRole.SERGEANT and not has_any_role(
            request.user, "Sergeant", "Administrator"
        ):
            raise PermissionDenied("Only sergeant can submit sergeant score.")

        score = serializer.save(suspect_profile=profile, scorer=request.user)
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

        if case_obj.severity == Case.Severity.CRITICAL and has_any_role(request.user, "Chief", "Administrator"):
            decision.chief = request.user
            decision.chief_confirmed = is_confirmed
            decision.save(update_fields=["chief", "chief_confirmed"])
            case_obj.status = Case.Status.IN_COURT if is_confirmed else Case.Status.OPEN
        elif is_confirmed and case_obj.severity != Case.Severity.CRITICAL:
            case_obj.status = Case.Status.IN_COURT
        elif is_confirmed and case_obj.severity == Case.Severity.CRITICAL:
            case_obj.status = Case.Status.ARRESTED
        else:
            case_obj.status = Case.Status.OPEN
        case_obj.save(update_fields=["status", "updated_at"])

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

        if decision.is_confirmed and decision.chief_confirmed:
            case_obj.status = Case.Status.IN_COURT
        else:
            case_obj.status = Case.Status.OPEN
        case_obj.save(update_fields=["status", "updated_at"])

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
        case_ids = DetectiveBoard.objects.filter(detective=request.user).values_list("case_id", flat=True)
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
