from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, CaseLog, Complaint, InterrogationScore, SuspectCaseProfile
from evidence.models import Evidence
from users.models import User


class ChecklistRegressionExtraTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 70000

    def _create_user(self, username, roles=None):
        self._seq += 1
        user = User.objects.create_user(
            username=username,
            password=self.password,
            email=f"{username}@example.com",
            phone_number=f"09{self._seq:09d}",
            national_id=f"{self._seq:010d}",
            first_name=username,
            last_name="tester",
        )
        for role_name in roles or []:
            group, _ = Group.objects.get_or_create(name=role_name)
            user.groups.add(group)
        return user

    def _create_case(
        self,
        creator,
        severity=Case.Severity.LEVEL_2,
        status_value=Case.Status.OPEN,
        assigned_detective=None,
    ):
        return Case.objects.create(
            title=f"Checklist case {severity}",
            description="Checklist flow fixture",
            location="Test area",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=status_value,
            severity=severity,
            created_by=creator,
            assigned_detective=assigned_detective,
        )

    def test_complaint_has_no_case_until_officer_approval_and_can_roundtrip(self):
        citizen = self._create_user("chk_citizen", roles=["Basic User"])
        cadet = self._create_user("chk_cadet", roles=["Cadet"])
        officer = self._create_user("chk_officer", roles=["Police Officer"])

        self.client.force_authenticate(citizen)
        create_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "No case before officer approval",
                "description": "Complaint created by citizen.",
                "location": "Zone A",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        complaint_id = create_resp.data["id"]

        self.client.force_authenticate(cadet)
        cadet_approve = self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Intake validated"},
            format="json",
        )
        self.assertEqual(cadet_approve.status_code, status.HTTP_200_OK)
        self.assertIsNone(cadet_approve.data["complaint"]["case"])

        self.client.force_authenticate(officer)
        officer_return = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "returned", "message": "Needs cadet re-check"},
            format="json",
        )
        self.assertEqual(officer_return.status_code, status.HTTP_200_OK)
        self.assertIsNone(officer_return.data["case"])
        self.assertEqual(officer_return.data["complaint"]["status"], Complaint.Status.RETURNED)

        latest_review = Complaint.objects.get(id=complaint_id).reviews.order_by("-created_at").first()
        self.assertIsNotNone(latest_review)
        self.assertEqual(latest_review.step, "officer")

        self.client.force_authenticate(cadet)
        self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Re-checked by cadet"},
            format="json",
        )
        self.client.force_authenticate(officer)
        officer_approve = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Final approval"},
            format="json",
        )
        self.assertEqual(officer_approve.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(officer_approve.data["case"])
        self.assertEqual(officer_approve.data["case"]["status"], Case.Status.OPEN)

    def test_critical_complaint_requires_chief_for_officer_approval(self):
        citizen = self._create_user("chk_citizen_critical", roles=["Basic User"])
        cadet = self._create_user("chk_cadet_critical", roles=["Cadet"])
        officer = self._create_user("chk_officer_critical", roles=["Police Officer"])
        chief = self._create_user("chk_chief_critical", roles=["Chief"])

        self.client.force_authenticate(citizen)
        complaint_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "Critical complaint gate",
                "description": "High-risk incident",
                "location": "Zone C",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        complaint_id = complaint_resp.data["id"]
        complaint = Complaint.objects.get(id=complaint_id)

        critical_case = Case.objects.create(
            title=complaint.title,
            description=complaint.description,
            location=complaint.location,
            incident_datetime=complaint.incident_datetime,
            source_type=Case.SourceType.COMPLAINT,
            status=Case.Status.PENDING_OFFICER,
            severity=Case.Severity.CRITICAL,
            created_by=citizen,
        )
        complaint.case = critical_case
        complaint.save(update_fields=["case", "updated_at"])

        self.client.force_authenticate(cadet)
        cadet_resp = self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Cadet approved"},
            format="json",
        )
        self.assertEqual(cadet_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(officer)
        denied_resp = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Officer tries approve critical"},
            format="json",
        )
        self.assertEqual(denied_resp.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(chief)
        chief_resp = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Chief approves critical"},
            format="json",
        )
        self.assertEqual(chief_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(chief_resp.data["case"]["status"], Case.Status.OPEN)

    def test_critical_crime_scene_created_by_captain_still_needs_chief_approval(self):
        captain = self._create_user("chk_captain_scene", roles=["Captain"])
        chief = self._create_user("chk_chief_scene", roles=["Chief"])

        self.client.force_authenticate(captain)
        create_resp = self.client.post(
            reverse("crime-scene-create"),
            {
                "title": "Critical scene by captain",
                "description": "Captain filed direct scene",
                "location": "Zone CS",
                "incident_datetime": timezone.now().isoformat(),
                "severity": Case.Severity.CRITICAL,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        case_id = create_resp.data["id"]
        self.assertEqual(create_resp.data["status"], Case.Status.PENDING_OFFICER)

        denied_approve = self.client.post(
            reverse("crime-scene-approve", kwargs={"case_id": case_id}),
            {},
            format="json",
        )
        self.assertEqual(denied_approve.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(chief)
        approved = self.client.post(
            reverse("crime-scene-approve", kwargs={"case_id": case_id}),
            {},
            format="json",
        )
        self.assertEqual(approved.status_code, status.HTTP_200_OK)
        self.assertEqual(approved.data["status"], Case.Status.OPEN)

    def test_submit_to_captain_requires_both_detective_and_sergeant_scores(self):
        officer = self._create_user("chk_officer_scores", roles=["Police Officer"])
        detective = self._create_user("chk_detective_scores", roles=["Detective"])
        sergeant = self._create_user("chk_sergeant_scores", roles=["Sergeant"])
        suspect = self._create_user("chk_suspect_scores", roles=["Suspect"])

        case_obj = self._create_case(
            officer,
            status_value=Case.Status.ARRESTED,
            assigned_detective=detective,
        )
        profile = SuspectCaseProfile.objects.create(
            case=case_obj,
            suspect=suspect,
            arrest_warrant_issued=True,
            is_arrested=True,
        )

        self.client.force_authenticate(sergeant)
        missing_both = self.client.post(
            reverse("submit-to-captain", kwargs={"case_id": case_obj.id}),
            {"message": "Send to captain"},
            format="json",
        )
        self.assertEqual(missing_both.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(detective)
        detective_score = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile.id}),
            {"scorer_role": "detective", "score": 8, "notes": "Detective score"},
            format="json",
        )
        self.assertEqual(detective_score.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(sergeant)
        missing_sergeant = self.client.post(
            reverse("submit-to-captain", kwargs={"case_id": case_obj.id}),
            {"message": "Still incomplete"},
            format="json",
        )
        self.assertEqual(missing_sergeant.status_code, status.HTTP_400_BAD_REQUEST)

        sergeant_score = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile.id}),
            {"scorer_role": "sergeant", "score": 9, "notes": "Sergeant score"},
            format="json",
        )
        self.assertEqual(sergeant_score.status_code, status.HTTP_201_CREATED)

        final_submit = self.client.post(
            reverse("submit-to-captain", kwargs={"case_id": case_obj.id}),
            {"message": "Package complete"},
            format="json",
        )
        self.assertEqual(final_submit.status_code, status.HTTP_200_OK)
        self.assertEqual(final_submit.data["case"]["status"], Case.Status.WAITING_CAPTAIN)

    def test_judiciary_report_includes_involved_personnel_and_board_snapshot_key(self):
        officer = self._create_user("chk_report_officer", roles=["Police Officer"])
        sergeant = self._create_user("chk_report_sergeant", roles=["Sergeant"])
        detective = self._create_user("chk_report_detective", roles=["Detective"])
        suspect = self._create_user("chk_report_suspect", roles=["Suspect"])
        chief = self._create_user("chk_report_chief", roles=["Chief"])

        case_obj = self._create_case(officer, status_value=Case.Status.OPEN)
        CaseLog.objects.create(case=case_obj, actor=sergeant, action="sergeant_note", description="Reviewed case")
        Evidence.objects.create(
            case=case_obj,
            title="Initial statement",
            description="Important operational note",
            type=Evidence.Type.OTHER,
            created_by=detective,
        )
        profile = SuspectCaseProfile.objects.create(case=case_obj, suspect=suspect)
        InterrogationScore.objects.create(
            suspect_profile=profile,
            scorer=detective,
            scorer_role=InterrogationScore.ScorerRole.DETECTIVE,
            score=7,
            notes="Preliminary score",
        )

        self.client.force_authenticate(chief)
        report_resp = self.client.get(
            reverse("case-comprehensive-report", kwargs={"case_id": case_obj.id})
        )
        self.assertEqual(report_resp.status_code, status.HTTP_200_OK)
        self.assertIn("involved_personnel", report_resp.data)
        self.assertIn("board_snapshot", report_resp.data)

        involved_names = {row["name"] for row in report_resp.data["involved_personnel"]}
        self.assertIn(f"{officer.first_name} {officer.last_name}".strip(), involved_names)
        self.assertIn(f"{sergeant.first_name} {sergeant.last_name}".strip(), involved_names)
        self.assertIn(f"{detective.first_name} {detective.last_name}".strip(), involved_names)

    def test_only_related_users_or_police_can_add_case_evidence(self):
        officer = self._create_user("chk_ev_officer", roles=["Police Officer"])
        complainant = self._create_user("chk_ev_complainant", roles=["Basic User"])
        outsider = self._create_user("chk_ev_outsider", roles=["Basic User"])

        case_obj = self._create_case(officer, status_value=Case.Status.OPEN)
        case_obj.complainants.add(complainant)

        self.client.force_authenticate(outsider)
        denied_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_obj.id,
                "title": "Outsider report",
                "description": "Should be denied",
                "type": "other",
            },
            format="json",
        )
        self.assertEqual(denied_resp.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(complainant)
        allowed_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_obj.id,
                "title": "Complainant evidence",
                "description": "Related citizen input",
                "type": "other",
            },
            format="json",
        )
        self.assertEqual(allowed_resp.status_code, status.HTTP_201_CREATED)
