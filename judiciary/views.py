from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from cases.models import Case
from evidence.serializers import EvidenceSerializer
from .models import Trial
from .serializers import TrialSerializer


def has_any_role(user, *roles):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    expected = {role.lower() for role in roles}
    return any(role.lower() in expected for role in user.role_names)


@extend_schema(tags=["Judiciary"], summary="Create trial and verdict", request=TrialSerializer, responses={201: TrialSerializer})
class TrialCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not has_any_role(request.user, "Judge", "Administrator"):
            raise PermissionDenied("Only judge role can register trials.")

        serializer = TrialSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        case_obj = serializer.validated_data["case"]
        if hasattr(case_obj, "trial"):
            raise ValidationError({"case": "This case already has a trial record."})
        if case_obj.status in {Case.Status.VOID, Case.Status.CLOSED}:
            raise ValidationError({"case": "Cannot trial a void/closed case."})
        if case_obj.status != Case.Status.IN_COURT:
            raise ValidationError({"case": "Case must be in IN_COURT status before trial."})

        trial = serializer.save(judge=request.user)
        case_obj.status = Case.Status.CLOSED
        case_obj.save(update_fields=["status", "updated_at"])
        return Response(TrialSerializer(trial).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Judiciary"], summary="Comprehensive case report", responses={200: OpenApiTypes.OBJECT})
class CaseComprehensiveReportAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, case_id):
        if not has_any_role(request.user, "Judge", "Captain", "Chief", "Administrator"):
            raise PermissionDenied("Only judge/captain/chief can view this report.")

        case_obj = get_object_or_404(Case.objects.select_related("created_by", "approved_by"), id=case_id)

        evidence_data = EvidenceSerializer(case_obj.evidences.all(), many=True).data
        complaints = case_obj.complaints.select_related("submitter").all()
        complaint_data = [
            {
                "id": item.id,
                "title": item.title,
                "status": item.status,
                "submitter": item.submitter.username,
                "invalid_attempt_count": item.invalid_attempt_count,
            }
            for item in complaints
        ]

        suspect_profiles = case_obj.suspect_profiles.select_related("suspect").all()
        suspect_data = []
        for profile in suspect_profiles:
            suspect_data.append(
                {
                    "profile_id": profile.id,
                    "suspect": {
                        "id": profile.suspect.id,
                        "username": profile.suspect.username,
                        "national_id": profile.suspect.national_id,
                    },
                    "wanted_since": profile.wanted_since,
                    "is_arrested": profile.is_arrested,
                    "scores": [
                        {
                            "scorer": score.scorer.username,
                            "role": score.scorer_role,
                            "score": score.score,
                            "notes": score.notes,
                        }
                        for score in profile.scores.select_related("scorer").all()
                    ],
                    "captain_decisions": [
                        {
                            "captain": decision.captain.username,
                            "is_confirmed": decision.is_confirmed,
                            "chief_confirmed": decision.chief_confirmed,
                            "summary": decision.summary,
                        }
                        for decision in profile.captain_decisions.select_related("captain").all()
                    ],
                }
            )

        trial_payload = None
        if hasattr(case_obj, "trial"):
            trial_payload = TrialSerializer(case_obj.trial).data

        response = {
            "case": {
                "id": case_obj.id,
                "title": case_obj.title,
                "description": case_obj.description,
                "location": case_obj.location,
                "incident_datetime": case_obj.incident_datetime,
                "severity": case_obj.severity,
                "status": case_obj.status,
                "source_type": case_obj.source_type,
                "created_by": case_obj.created_by.username,
                "approved_by": case_obj.approved_by.username if case_obj.approved_by else None,
                "complainants": [person.username for person in case_obj.complainants.all()],
                "witnesses": [person.username for person in case_obj.witnesses.all()],
                "suspects": [person.username for person in case_obj.suspects.all()],
            },
            "complaints": complaint_data,
            "evidence": evidence_data,
            "suspect_profiles": suspect_data,
            "trial": trial_payload,
        }
        return Response(response)
