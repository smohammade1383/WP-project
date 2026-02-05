from django.contrib.auth import get_user_model
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Case, SuspectCaseProfile
from .permissions import CanViewAggregatedStats

User = get_user_model()


class AggregatedStatsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanViewAggregatedStats]

    def get(self, request):
        data = {
            "total_cases": Case.objects.count(),
            "active_cases": Case.objects.exclude(status__in=[Case.Status.CLOSED, Case.Status.VOID]).count(),
            "solved_cases": Case.objects.filter(status=Case.Status.CLOSED).count(),
            "staff_count": User.objects.filter(is_staff=True).count(),
            "wanted_count": SuspectCaseProfile.objects.filter(is_arrested=False).values("suspect_id").distinct().count(),
        }
        return Response(data)
