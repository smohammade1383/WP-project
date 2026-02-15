from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from cases.models import Case, Notification, SuspectCaseProfile
from .models import CitizenTip
from .serializers import (
    AggregatedStatsSerializer,
    CitizenTipDetectiveReviewSerializer,
    CitizenTipOfficerReviewSerializer,
    CitizenTipSerializer,
    WantedPersonSerializer,
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


def push_notification(*, recipient, message, case_obj=None):
    if not recipient or not getattr(recipient, "is_active", False):
        return
    Notification.objects.create(
        recipient=recipient,
        case=case_obj,
        message=message,
    )


def _refresh_severe_tracking(profiles):
    severe_profiles = []
    for profile in profiles:
        profile.severe_tracking = profile.is_severe_tracking
        profile.save(update_fields=["severe_tracking"])
        if profile.severe_tracking:
            severe_profiles.append(profile)
    return severe_profiles


def _unique_profiles_by_suspect(profiles):
    unique = {}
    for profile in profiles:
        existing = unique.get(profile.suspect_id)
        if not existing or profile.case.severity > existing.case.severity:
            unique[profile.suspect_id] = profile
    return list(unique.values())


@extend_schema_view(
    get=extend_schema(tags=["People"], summary="Public list of severe tracking suspects", responses={200: WantedPersonSerializer(many=True)}),
)
class PublicWantedListAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        profiles = SuspectCaseProfile.objects.select_related("suspect", "case").all()
        severe_profiles = _refresh_severe_tracking(profiles)
        unique_profiles = _unique_profiles_by_suspect(severe_profiles)
        unique_profiles.sort(key=lambda item: item.ranking_score, reverse=True)
        return Response(WantedPersonSerializer(unique_profiles, many=True).data)


@extend_schema_view(
    get=extend_schema(tags=["People"], summary="Public wanted suspect detail", responses={200: WantedPersonSerializer}),
)
class PublicWantedDetailAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, suspect_id):
        profiles = SuspectCaseProfile.objects.select_related("suspect", "case").filter(suspect_id=suspect_id)
        if not profiles.exists():
            return Response({"detail": "Wanted suspect not found."}, status=404)
        severe_profiles = _refresh_severe_tracking(profiles)
        if not severe_profiles:
            return Response({"detail": "Suspect is not under severe tracking."}, status=404)
        chosen = _unique_profiles_by_suspect(severe_profiles)[0]
        return Response(WantedPersonSerializer(chosen).data)


@extend_schema_view(
    get=extend_schema(tags=["People"], summary="Public aggregated stats", responses={200: AggregatedStatsSerializer}),
)
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


@extend_schema_view(
    get=extend_schema(tags=["People"], summary="List citizen tips", responses={200: CitizenTipSerializer(many=True)}),
    post=extend_schema(tags=["People"], summary="Submit citizen tip", request=CitizenTipSerializer, responses={201: CitizenTipSerializer}),
)
class CitizenTipListCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if has_any_role(request.user, "Detective", "Police Officer", "Patrol Officer", "Sergeant", "Captain", "Chief", "Administrator"):
            tips = CitizenTip.objects.all().select_related("reporter", "case", "suspect_profile")
        else:
            tips = CitizenTip.objects.filter(reporter=request.user).select_related("reporter", "case", "suspect_profile")
        return Response(CitizenTipSerializer(tips, many=True).data)

    def post(self, request):
        serializer = CitizenTipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tip = serializer.save(reporter=request.user, status=CitizenTip.Status.OFFICER_REVIEW)
        push_notification(
            recipient=request.user,
            case_obj=tip.case,
            message=f"گزارش مردمی #{tip.id} با موفقیت ثبت شد و در صف بررسی افسر قرار گرفت.",
        )
        return Response(CitizenTipSerializer(tip).data, status=status.HTTP_201_CREATED)


@extend_schema(
    tags=["People"],
    summary="Officer reviews citizen tip",
    request=CitizenTipOfficerReviewSerializer,
    responses={200: CitizenTipSerializer},
)
class CitizenTipOfficerReviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, tip_id):
        if not has_any_role(
            request.user,
            "Police Officer",
            "Patrol Officer",
            "Sergeant",
            "Captain",
            "Chief",
            "Administrator",
        ):
            return Response({"detail": "Only officer+ roles can review citizen tips."}, status=403)

        tip = get_object_or_404(CitizenTip, id=tip_id)
        serializer = CitizenTipOfficerReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        approved = serializer.validated_data["approved"]
        tip.officer_reviewer = request.user
        tip.status = CitizenTip.Status.DETECTIVE_REVIEW if approved else CitizenTip.Status.OFFICER_REVIEW
        tip.save(update_fields=["officer_reviewer", "status"])
        push_notification(
            recipient=tip.reporter,
            case_obj=tip.case,
            message=(
                f"گزارش مردمی #{tip.id} توسط افسر {'تایید' if approved else 'رد'} شد."
                f"{' و به صف کارآگاه رفت.' if approved else ''}"
            ),
        )
        return Response(CitizenTipSerializer(tip).data)


@extend_schema(
    tags=["People"],
    summary="Detective reviews citizen tip",
    request=CitizenTipDetectiveReviewSerializer,
    responses={200: CitizenTipSerializer},
)
class CitizenTipDetectiveReviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, tip_id):
        if not has_any_role(request.user, "Detective", "Administrator"):
            return Response({"detail": "Only detective role can review citizen tips."}, status=403)

        tip = get_object_or_404(CitizenTip, id=tip_id)
        serializer = CitizenTipDetectiveReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        approved = serializer.validated_data["approved"]
        tip.detective_reviewer = request.user
        tip.status = CitizenTip.Status.APPROVED if approved else CitizenTip.Status.OFFICER_REVIEW
        tip.save(update_fields=["detective_reviewer", "status"])
        push_notification(
            recipient=tip.reporter,
            case_obj=tip.case,
            message=(
                f"گزارش مردمی #{tip.id} توسط کارآگاه {'تایید نهایی' if approved else 'رد'} شد."
            ),
        )
        return Response(CitizenTipSerializer(tip).data)
