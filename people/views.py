from django.contrib.auth import get_user_model
from django.db.models import Q
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from cases.models import Case, SuspectCaseProfile
from .serializers import AggregatedStatsSerializer, WantedPersonSerializer

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
