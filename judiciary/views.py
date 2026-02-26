from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from cases.models import Case
from cases.notify import notify_roles, notify_users
from evidence.serializers import EvidenceSerializer
from .models import Trial
from .serializers import CaseReportSerializer, TrialSerializer


def has_any_role(user, *roles):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    expected = set(roles)
    return any(role in expected for role in user.role_names)


ROLE_PRIORITY = (
    "Administrator",
    "Chief",
    "Captain",
    "Sergeant",
    "Detective",
    "Police Officer",
    "Patrol Officer",
    "Cadet",
    "Judge",
    "Coroner",
    "Criminal",
    "Suspect",
    "Witness",
    "Complainant",
    "Basic User",
)


COURT_AUDIENCE_ROLES = {"Captain", "Chief", "Administrator"}


def _display_name(user):
    full = f"{user.first_name} {user.last_name}".strip()
    return full if full else user.username


def _rank_from_roles(user):
    roles = list(user.role_names)
    if not roles and user.is_superuser:
        return "Administrator"
    for role in ROLE_PRIORITY:
        if role in roles:
            return role
    return roles[0] if roles else "Unassigned"


def _track_involved_person(registry, user, action_date):
    roles = list(user.role_names)
    if not roles and user.is_superuser:
        roles = ["Administrator"]
    payload = {
        "name": _display_name(user),
        "rank": _rank_from_roles(user),
        "role": ", ".join(roles) if roles else "Unassigned",
        "action_date": action_date,
    }
    existing = registry.get(user.id)
    if existing is None or action_date > existing["action_date"]:
        registry[user.id] = payload


def _case_watchers(case_obj):
    recipients = [case_obj.created_by]
    recipients.extend(list(case_obj.complainants.all()))
    if case_obj.assigned_detective_id:
        recipients.append(case_obj.assigned_detective)
    if case_obj.assigned_sergeant_id:
        recipients.append(case_obj.assigned_sergeant)
    return recipients


@extend_schema(tags=["Judiciary"], summary="Create trial and verdict", request=TrialSerializer, responses={201: TrialSerializer})
class TrialCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not has_any_role(request.user, "Judge", "Administrator"):
            raise PermissionDenied("Only judge role can register trials.")

        serializer = TrialSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        case_obj = serializer.validated_data["case"]
        case_suspect_ids = set(case_obj.suspect_profiles.values_list("suspect_id", flat=True))
        if not case_suspect_ids:
            raise ValidationError({"case": "No suspects are registered for this case."})

        defendant = serializer.validated_data.get("defendant")
        tried_defendant_ids = set(
            Trial.objects.filter(case=case_obj, defendant_id__isnull=False).values_list("defendant_id", flat=True)
        )
        pending_defendant_ids = case_suspect_ids - tried_defendant_ids

        if defendant is None:
            if len(pending_defendant_ids) == 1:
                only_id = next(iter(pending_defendant_ids))
                defendant = case_obj.suspect_profiles.select_related("suspect").get(suspect_id=only_id).suspect
                serializer.validated_data["defendant"] = defendant
            else:
                raise ValidationError(
                    {"defendant": "Defendant is required when multiple unjudged suspects exist."}
                )

        if defendant.id not in case_suspect_ids:
            raise ValidationError({"defendant": "Defendant must be one of the case suspects."})
        if defendant.id in tried_defendant_ids:
            raise ValidationError({"defendant": "This defendant already has a trial for this case."})
        if case_obj.status in {Case.Status.VOID, Case.Status.CLOSED}:
            raise ValidationError({"case": "Cannot trial a void/closed case."})
        if case_obj.status != Case.Status.IN_COURT:
            raise ValidationError({"case": "Case must be in IN_COURT status before trial."})

        trial = serializer.save(judge=request.user)
        tried_defendant_ids.add(defendant.id)
        exclude_ids = {request.user.id}

        verdict_label = trial.get_verdict_display()
        notify_users(
            [defendant],
            message=(
                f"برای پرونده #{case_obj.id} یک جلسه دادگاه ثبت شد. "
                f"وضعیت رای فعلی: {verdict_label}."
            ),
            case=case_obj,
            exclude_user_ids=exclude_ids,
        )
        notify_users(
            _case_watchers(case_obj),
            message=(
                f"دادگاه پرونده #{case_obj.id} برای مظنون "
                f"{_display_name(defendant)} ثبت شد (رای: {verdict_label})."
            ),
            case=case_obj,
            exclude_user_ids=exclude_ids,
        )
        notify_roles(
            COURT_AUDIENCE_ROLES,
            message=(
                f"به‌روزرسانی دادگاه: پرونده #{case_obj.id} برای "
                f"{_display_name(defendant)} با رای {verdict_label} ثبت شد."
            ),
            case=case_obj,
            exclude_user_ids=exclude_ids,
        )

        if case_suspect_ids.issubset(tried_defendant_ids):
            case_obj.status = Case.Status.CLOSED
            case_obj.save(update_fields=["status", "updated_at"])
            notify_users(
                _case_watchers(case_obj),
                message=f"پرونده #{case_obj.id} پس از تکمیل فرآیند دادگاه بسته شد.",
                case=case_obj,
                exclude_user_ids=exclude_ids,
            )
            notify_roles(
                COURT_AUDIENCE_ROLES,
                message=f"پرونده #{case_obj.id} پس از تکمیل دادگاه مختومه (Closed) شد.",
                case=case_obj,
                exclude_user_ids=exclude_ids,
            )
        return Response(TrialSerializer(trial).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Judiciary"], summary="Comprehensive case report", responses={200: CaseReportSerializer})
class CaseComprehensiveReportAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, case_id):
        if not has_any_role(request.user, "Judge", "Captain", "Chief", "Administrator"):
            raise PermissionDenied("Only judge/captain/chief can view this report.")

        case_obj = get_object_or_404(
            Case.objects.select_related("created_by", "approved_by").prefetch_related(
                "complainants",
                "witnesses",
                "suspects",
                "logs__actor",
                "evidences__created_by",
            ),
            id=case_id,
        )

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
        pending_chief_decision_ids = []
        suspect_data = []
        for profile in suspect_profiles:
            captain_decisions = []
            for decision in profile.captain_decisions.select_related("captain", "chief").all():
                captain_decisions.append(
                    {
                        "id": decision.id,
                        "captain": decision.captain.username,
                        "chief": decision.chief.username if decision.chief else None,
                        "is_confirmed": decision.is_confirmed,
                        "chief_confirmed": decision.chief_confirmed,
                        "summary": decision.summary,
                    }
                )
                if decision.is_confirmed and decision.chief_confirmed is None:
                    pending_chief_decision_ids.append(decision.id)
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
                            "created_at": score.created_at,
                        }
                        for score in profile.scores.select_related("scorer").all()
                    ],
                    "captain_decisions": captain_decisions,
                }
            )

        trials = case_obj.trials.all()
        trial_payload = TrialSerializer(trials, many=True).data

        involved_registry = {}
        _track_involved_person(involved_registry, case_obj.created_by, case_obj.created_at)
        if case_obj.approved_by:
            _track_involved_person(involved_registry, case_obj.approved_by, case_obj.updated_at)

        for log in case_obj.logs.select_related("actor").all():
            _track_involved_person(involved_registry, log.actor, log.timestamp)

        for complaint in complaints:
            _track_involved_person(involved_registry, complaint.submitter, complaint.created_at)
            for review in complaint.reviews.select_related("reviewer").all():
                _track_involved_person(involved_registry, review.reviewer, review.created_at)

        for evidence in case_obj.evidences.select_related("created_by").all():
            _track_involved_person(involved_registry, evidence.created_by, evidence.created_at)

        for profile in suspect_profiles:
            for score in profile.scores.select_related("scorer").all():
                _track_involved_person(involved_registry, score.scorer, score.created_at)
            for decision in profile.captain_decisions.select_related("captain", "chief").all():
                _track_involved_person(involved_registry, decision.captain, decision.created_at)
                if decision.chief:
                    _track_involved_person(involved_registry, decision.chief, decision.created_at)

        for trial in trials.select_related("judge").all():
            _track_involved_person(involved_registry, trial.judge, trial.created_at)

        board = getattr(case_obj, "board", None)
        board_snapshot = None
        if board:
            _track_involved_person(involved_registry, board.detective, board.created_at)
            board_snapshot = {
                "id": board.id,
                "detective": {
                    "id": board.detective.id,
                    "name": _display_name(board.detective),
                    "rank": _rank_from_roles(board.detective),
                },
                "items": [
                    {
                        "id": item.id,
                        "item_type": item.item_type,
                        "note_text": item.note_text,
                        "evidence_id": item.evidence_id,
                        "evidence_title": item.evidence.title if item.evidence_id else "",
                        "user_id": item.user_id,
                        "user_name": _display_name(item.user) if item.user_id else "",
                        "position_x": item.position_x,
                        "position_y": item.position_y,
                        "width": item.width,
                        "height": item.height,
                    }
                    for item in board.items.select_related("evidence", "user").all()
                ],
                "links": [
                    {
                        "id": link.id,
                        "from_item": link.from_item_id,
                        "to_item": link.to_item_id,
                        "description": link.description,
                    }
                    for link in board.links.all()
                ],
            }

        involved_personnel = sorted(
            involved_registry.values(),
            key=lambda row: row["action_date"],
            reverse=True,
        )

        complainants_payload = [
            {
                "id": person.id,
                "username": person.username,
                "name": _display_name(person),
                "rank": _rank_from_roles(person),
                "roles": list(person.role_names),
            }
            for person in case_obj.complainants.all()
        ]
        criminals_payload = []
        for trial in trials:
            if trial.verdict != Trial.Verdict.GUILTY or not trial.defendant_id:
                continue
            defendant = trial.defendant
            criminals_payload.append(
                {
                    "id": defendant.id,
                    "username": defendant.username,
                    "name": _display_name(defendant),
                    "rank": _rank_from_roles(defendant),
                    "roles": list(defendant.role_names),
                }
            )

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
                "created_at": case_obj.created_at,
                "updated_at": case_obj.updated_at,
                "created_by": case_obj.created_by.username,
                "approved_by": case_obj.approved_by.username if case_obj.approved_by else None,
                "complainants": [person.username for person in case_obj.complainants.all()],
                "witnesses": [person.username for person in case_obj.witnesses.all()],
                "suspects": [person.username for person in case_obj.suspects.all()],
            },
            "complaints": complaint_data,
            "evidence": evidence_data,
            "suspect_profiles": suspect_data,
            "trials": trial_payload,
            "complainants": complainants_payload,
            "criminals": criminals_payload,
            "involved_personnel": involved_personnel,
            "pending_chief_decision_ids": sorted(set(pending_chief_decision_ids)),
            "board_snapshot": board_snapshot,
        }
        serializer = CaseReportSerializer(data=response)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data)
