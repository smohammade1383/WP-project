from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, Complaint, SuspectCaseProfile
from users.models import User


class NonFinancialProcessRegressionTests(APITestCase):
    """
    Regression coverage for end-to-end business logic excluding:
    - reward flows
    - bail/payment flows
    """

    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 30000

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
        created_by,
        severity=Case.Severity.LEVEL_2,
        status_value=Case.Status.OPEN,
        assigned_detective=None,
    ):
        return Case.objects.create(
            title=f"Case-{severity}-{status_value}",
            description="Non-financial process test case",
            location="Test district",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=status_value,
            severity=severity,
            created_by=created_by,
            assigned_detective=assigned_detective,
        )

    def test_auth_signup_and_multi_identifier_login(self):
        signup_resp = self.client.post(
            reverse("signup"),
            {
                "username": "nf_signup_user",
                "password": self.password,
                "email": "nf_signup_user@example.com",
                "phone_number": "09121234567",
                "national_id": "1234567890",
                "first_name": "non",
                "last_name": "financial",
            },
            format="json",
        )
        self.assertEqual(signup_resp.status_code, status.HTTP_201_CREATED)

        identifiers = [
            "nf_signup_user",
            "nf_signup_user@example.com",
            "09121234567",
            "1234567890",
        ]
        for identifier in identifiers:
            login_resp = self.client.post(
                reverse("login"),
                {"identifier": identifier, "password": self.password},
                format="json",
            )
            self.assertEqual(login_resp.status_code, status.HTTP_200_OK)
            self.assertIn("Basic User", login_resp.data["user"]["role_names"])

            logout_resp = self.client.post(reverse("logout"), {}, format="json")
            self.assertEqual(logout_resp.status_code, status.HTTP_200_OK)

    def test_dynamic_custom_role_without_police_access_and_then_detective_grant(self):
        admin = self._create_user("nf_admin", roles=["Administrator"])
        target = self._create_user("nf_target", roles=["Basic User"])

        self.client.force_authenticate(admin)
        create_role_resp = self.client.post(
            reverse("role-list-create"),
            {"name": "ViewerLite", "description": "Custom read-only idea", "permissions": []},
            format="json",
        )
        self.assertEqual(create_role_resp.status_code, status.HTTP_201_CREATED)

        add_viewer_resp = self.client.post(
            reverse("user-role-manage", kwargs={"user_id": target.id}),
            {"role_names": ["ViewerLite"]},
            format="json",
        )
        self.assertEqual(add_viewer_resp.status_code, status.HTTP_200_OK)

        remove_basic_resp = self.client.delete(
            reverse("user-role-manage", kwargs={"user_id": target.id}),
            {"role_names": ["Basic User"]},
            format="json",
        )
        self.assertEqual(remove_basic_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(target)
        denied_list_resp = self.client.get(reverse("case-list-create"))
        self.assertEqual(denied_list_resp.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(admin)
        grant_detective_resp = self.client.post(
            reverse("user-role-manage", kwargs={"user_id": target.id}),
            {"role_names": ["Detective"]},
            format="json",
        )
        self.assertEqual(grant_detective_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(target)
        allowed_list_resp = self.client.get(reverse("case-list-create"))
        self.assertEqual(allowed_list_resp.status_code, status.HTTP_200_OK)

    def test_detective_can_create_crime_scene_and_sergeant_can_approve(self):
        detective = self._create_user("nf_detective_creator", roles=["Detective"])
        sergeant = self._create_user("nf_sergeant_approver", roles=["Sergeant"])

        self.client.force_authenticate(detective)
        create_resp = self.client.post(
            reverse("crime-scene-create"),
            {
                "title": "Field report by detective",
                "description": "Observed suspicious armed incident",
                "location": "Zone D",
                "incident_datetime": timezone.now().isoformat(),
                "severity": Case.Severity.LEVEL_2,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_resp.data["status"], Case.Status.PENDING_OFFICER)
        case_id = create_resp.data["id"]

        self.client.force_authenticate(sergeant)
        approve_resp = self.client.post(
            reverse("crime-scene-approve", kwargs={"case_id": case_id}),
            {},
            format="json",
        )
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(approve_resp.data["status"], Case.Status.OPEN)

    def test_critical_crime_scene_requires_chief_approval(self):
        officer = self._create_user("nf_officer_critical", roles=["Police Officer"])
        captain = self._create_user("nf_captain_not_enough", roles=["Captain"])
        chief = self._create_user("nf_chief_required", roles=["Chief"])

        self.client.force_authenticate(officer)
        create_resp = self.client.post(
            reverse("crime-scene-create"),
            {
                "title": "Critical terror scene",
                "description": "High-profile incident",
                "location": "Central",
                "incident_datetime": timezone.now().isoformat(),
                "severity": Case.Severity.CRITICAL,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        case_id = create_resp.data["id"]

        self.client.force_authenticate(captain)
        denied_resp = self.client.post(
            reverse("crime-scene-approve", kwargs={"case_id": case_id}),
            {},
            format="json",
        )
        self.assertEqual(denied_resp.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(chief)
        approved_resp = self.client.post(
            reverse("crime-scene-approve", kwargs={"case_id": case_id}),
            {},
            format="json",
        )
        self.assertEqual(approved_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(approved_resp.data["status"], Case.Status.OPEN)

    def test_chief_direct_crime_scene_creation_is_immediately_open(self):
        chief = self._create_user("nf_chief_direct", roles=["Chief"])
        self.client.force_authenticate(chief)

        create_resp = self.client.post(
            reverse("crime-scene-create"),
            {
                "title": "Chief direct filing",
                "description": "Critical intelligence-based filing",
                "location": "HQ",
                "incident_datetime": timezone.now().isoformat(),
                "severity": Case.Severity.CRITICAL,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_resp.data["status"], Case.Status.OPEN)
        self.assertEqual(create_resp.data["approved_by"]["id"], chief.id)

    def test_bio_evidence_is_board_blocked_until_coroner_accepts(self):
        officer = self._create_user("nf_case_officer", roles=["Police Officer"])
        detective = self._create_user("nf_case_detective", roles=["Detective"])
        coroner = self._create_user("nf_case_coroner", roles=["Coroner"])
        case_obj = self._create_case(officer, severity=Case.Severity.LEVEL_2, assigned_detective=detective)

        self.client.force_authenticate(detective)
        bio_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_obj.id,
                "title": "Blood sample",
                "description": "Needs lab confirmation",
                "type": "bio_medical",
            },
            format="json",
        )
        self.assertEqual(bio_resp.status_code, status.HTTP_201_CREATED)
        evidence_id = bio_resp.data["id"]

        blocked_resp = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_obj.id}),
            {
                "item_type": "evidence",
                "evidence": evidence_id,
                "position_x": 100,
                "position_y": 100,
            },
            format="json",
        )
        self.assertEqual(blocked_resp.status_code, status.HTTP_400_BAD_REQUEST)

        detective_illegal_patch = self.client.patch(
            reverse("evidence-rud", kwargs={"pk": evidence_id}),
            {"bio_validation_status": "accepted", "lab_result": "Detective cannot do this"},
            format="json",
        )
        self.assertEqual(detective_illegal_patch.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(coroner)
        coroner_patch = self.client.patch(
            reverse("evidence-rud", kwargs={"pk": evidence_id}),
            {"bio_validation_status": "accepted", "lab_result": "DNA matched."},
            format="json",
        )
        self.assertEqual(coroner_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(coroner_patch.data["details"]["validation_status"], "accepted")

        self.client.force_authenticate(detective)
        allowed_resp = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_obj.id}),
            {
                "item_type": "evidence",
                "evidence": evidence_id,
                "position_x": 220,
                "position_y": 180,
            },
            format="json",
        )
        self.assertEqual(allowed_resp.status_code, status.HTTP_201_CREATED)

    def test_sergeant_claim_workflow_enforces_case_ownership(self):
        officer = self._create_user("nf_claim_officer", roles=["Police Officer"])
        detective = self._create_user("nf_claim_detective", roles=["Detective"])
        sergeant_a = self._create_user("nf_claim_sergeant_a", roles=["Sergeant"])
        sergeant_b = self._create_user("nf_claim_sergeant_b", roles=["Sergeant"])
        suspect = self._create_user("nf_claim_suspect", roles=["Suspect"])

        case_obj = self._create_case(
            officer,
            severity=Case.Severity.LEVEL_2,
            status_value=Case.Status.WARRANT_PENDING,
            assigned_detective=detective,
        )
        SuspectCaseProfile.objects.create(case=case_obj, suspect=suspect)

        self.client.force_authenticate(sergeant_a)
        unassigned_a = self.client.get(reverse("case-unassigned-sergeant-list"))
        self.assertEqual(unassigned_a.status_code, status.HTTP_200_OK)
        self.assertTrue(any(item["id"] == case_obj.id for item in unassigned_a.data))

        self.client.force_authenticate(sergeant_b)
        decision_before_claim = self.client.post(
            reverse("sergeant-decision", kwargs={"case_id": case_obj.id}),
            {"approved": True, "message": "Attempt without claim"},
            format="json",
        )
        self.assertEqual(decision_before_claim.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(sergeant_a)
        claim_a = self.client.post(
            reverse("case-claim-sergeant", kwargs={"case_id": case_obj.id}),
            {},
            format="json",
        )
        self.assertEqual(claim_a.status_code, status.HTTP_200_OK)

        owned_a = self.client.get(reverse("case-list-create"))
        self.assertEqual(owned_a.status_code, status.HTTP_200_OK)
        self.assertTrue(any(item["id"] == case_obj.id for item in owned_a.data))

        self.client.force_authenticate(sergeant_b)
        owned_b = self.client.get(reverse("case-list-create"))
        self.assertEqual(owned_b.status_code, status.HTTP_200_OK)
        self.assertFalse(any(item["id"] == case_obj.id for item in owned_b.data))

        claim_b = self.client.post(
            reverse("case-claim-sergeant", kwargs={"case_id": case_obj.id}),
            {},
            format="json",
        )
        self.assertEqual(claim_b.status_code, status.HTTP_400_BAD_REQUEST)

        decision_other_sergeant = self.client.post(
            reverse("sergeant-decision", kwargs={"case_id": case_obj.id}),
            {"approved": True, "message": "Still unauthorized"},
            format="json",
        )
        self.assertEqual(decision_other_sergeant.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(sergeant_a)
        decision_owner = self.client.post(
            reverse("sergeant-decision", kwargs={"case_id": case_obj.id}),
            {"approved": True, "message": "Owner decision"},
            format="json",
        )
        self.assertEqual(decision_owner.status_code, status.HTTP_200_OK)

    def test_noncritical_operational_pipeline_to_closed_case(self):
        officer = self._create_user("nf_pipeline_officer", roles=["Police Officer"])
        detective = self._create_user("nf_pipeline_detective", roles=["Detective"])
        sergeant = self._create_user("nf_pipeline_sergeant", roles=["Sergeant"])
        captain = self._create_user("nf_pipeline_captain", roles=["Captain"])
        judge = self._create_user("nf_pipeline_judge", roles=["Judge"])
        suspect = self._create_user("nf_pipeline_suspect", roles=["Suspect"])

        case_obj = self._create_case(
            officer,
            severity=Case.Severity.LEVEL_2,
            status_value=Case.Status.OPEN,
            assigned_detective=detective,
        )

        self.client.force_authenticate(detective)
        nominate_resp = self.client.post(
            reverse("suspects-nominate", kwargs={"case_id": case_obj.id}),
            {"suspect_ids": [suspect.id], "summary": "Likely offender from board analysis."},
            format="json",
        )
        self.assertEqual(nominate_resp.status_code, status.HTTP_200_OK)
        profile_id = nominate_resp.data[0]["id"]

        self.client.force_authenticate(sergeant)
        claim_resp = self.client.post(
            reverse("case-claim-sergeant", kwargs={"case_id": case_obj.id}),
            {},
            format="json",
        )
        self.assertEqual(claim_resp.status_code, status.HTTP_200_OK)
        sergeant_decision_resp = self.client.post(
            reverse("sergeant-decision", kwargs={"case_id": case_obj.id}),
            {"approved": True, "message": "Warrant issued"},
            format="json",
        )
        self.assertEqual(sergeant_decision_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(officer)
        arrest_resp = self.client.post(reverse("suspect-arrest", kwargs={"profile_id": profile_id}), {}, format="json")
        self.assertEqual(arrest_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(detective)
        detective_score_resp = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile_id}),
            {"scorer_role": "detective", "score": 8, "notes": "Strong certainty"},
            format="json",
        )
        self.assertEqual(detective_score_resp.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(sergeant)
        sergeant_score_resp = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile_id}),
            {"scorer_role": "sergeant", "score": 9, "notes": "Confession + consistency"},
            format="json",
        )
        self.assertEqual(sergeant_score_resp.status_code, status.HTTP_201_CREATED)

        submit_resp = self.client.post(
            reverse("submit-to-captain", kwargs={"case_id": case_obj.id}),
            {"message": "Package complete"},
            format="json",
        )
        self.assertEqual(submit_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_resp.data["case"]["status"], Case.Status.WAITING_CAPTAIN)

        self.client.force_authenticate(captain)
        captain_resp = self.client.post(
            reverse("captain-decision", kwargs={"profile_id": profile_id}),
            {"is_confirmed": True, "summary": "Send to court"},
            format="json",
        )
        self.assertEqual(captain_resp.status_code, status.HTTP_201_CREATED)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.IN_COURT)

        self.client.force_authenticate(judge)
        trial_resp = self.client.post(
            reverse("trial-create"),
            {
                "case": case_obj.id,
                "defendant": suspect.id,
                "verdict": "guilty",
                "verdict_note": "Fully proven",
                "punishment_title": "Prison",
                "punishment_description": "Five years",
            },
            format="json",
        )
        self.assertEqual(trial_resp.status_code, status.HTTP_201_CREATED)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.CLOSED)

    def test_critical_pipeline_requires_chief_before_trial(self):
        officer = self._create_user("nf_critical_officer", roles=["Police Officer"])
        detective = self._create_user("nf_critical_detective", roles=["Detective"])
        sergeant = self._create_user("nf_critical_sergeant", roles=["Sergeant"])
        captain = self._create_user("nf_critical_captain", roles=["Captain"])
        chief = self._create_user("nf_critical_chief", roles=["Chief"])
        judge = self._create_user("nf_critical_judge", roles=["Judge"])
        suspect = self._create_user("nf_critical_suspect", roles=["Suspect"])

        case_obj = self._create_case(
            officer,
            severity=Case.Severity.CRITICAL,
            status_value=Case.Status.OPEN,
            assigned_detective=detective,
        )

        self.client.force_authenticate(detective)
        nominate_resp = self.client.post(
            reverse("suspects-nominate", kwargs={"case_id": case_obj.id}),
            {"suspect_ids": [suspect.id], "summary": "Critical suspect nomination"},
            format="json",
        )
        self.assertEqual(nominate_resp.status_code, status.HTTP_200_OK)
        profile_id = nominate_resp.data[0]["id"]

        self.client.force_authenticate(sergeant)
        claim_resp = self.client.post(
            reverse("case-claim-sergeant", kwargs={"case_id": case_obj.id}),
            {},
            format="json",
        )
        self.assertEqual(claim_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(
                reverse("sergeant-decision", kwargs={"case_id": case_obj.id}),
                {"approved": True, "message": "Critical warrant issued"},
                format="json",
            ).status_code,
            status.HTTP_200_OK,
        )

        self.client.force_authenticate(officer)
        self.assertEqual(
            self.client.post(reverse("suspect-arrest", kwargs={"profile_id": profile_id}), {}, format="json").status_code,
            status.HTTP_200_OK,
        )

        self.client.force_authenticate(detective)
        self.assertEqual(
            self.client.post(
                reverse("suspect-score", kwargs={"profile_id": profile_id}),
                {"scorer_role": "detective", "score": 10, "notes": "Critical confidence"},
                format="json",
            ).status_code,
            status.HTTP_201_CREATED,
        )
        self.client.force_authenticate(sergeant)
        self.assertEqual(
            self.client.post(
                reverse("suspect-score", kwargs={"profile_id": profile_id}),
                {"scorer_role": "sergeant", "score": 9, "notes": "High-risk suspect"},
                format="json",
            ).status_code,
            status.HTTP_201_CREATED,
        )
        self.assertEqual(
            self.client.post(
                reverse("submit-to-captain", kwargs={"case_id": case_obj.id}),
                {"message": "Critical file forwarded"},
                format="json",
            ).status_code,
            status.HTTP_200_OK,
        )

        self.client.force_authenticate(captain)
        captain_resp = self.client.post(
            reverse("captain-decision", kwargs={"profile_id": profile_id}),
            {"is_confirmed": True, "summary": "Escalate to chief"},
            format="json",
        )
        self.assertEqual(captain_resp.status_code, status.HTTP_201_CREATED)
        decision_id = captain_resp.data["id"]
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.WAITING_CHIEF)

        self.client.force_authenticate(judge)
        blocked_trial = self.client.post(
            reverse("trial-create"),
            {
                "case": case_obj.id,
                "defendant": suspect.id,
                "verdict": "guilty",
                "verdict_note": "Attempt before chief confirmation",
                "punishment_title": "Prison",
                "punishment_description": "Must be blocked",
            },
            format="json",
        )
        self.assertEqual(blocked_trial.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(chief)
        chief_resp = self.client.post(
            reverse("chief-decision", kwargs={"decision_id": decision_id}),
            {"chief_confirmed": True, "summary": "Confirmed by chief"},
            format="json",
        )
        self.assertEqual(chief_resp.status_code, status.HTTP_200_OK)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.IN_COURT)

        self.client.force_authenticate(judge)
        final_trial = self.client.post(
            reverse("trial-create"),
            {
                "case": case_obj.id,
                "defendant": suspect.id,
                "verdict": "guilty",
                "verdict_note": "Now valid after chief",
                "punishment_title": "Long-term prison",
                "punishment_description": "Critical conviction",
            },
            format="json",
        )
        self.assertEqual(final_trial.status_code, status.HTTP_201_CREATED)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.CLOSED)

    def test_comprehensive_report_access_control(self):
        officer = self._create_user("nf_report_officer", roles=["Police Officer"])
        detective = self._create_user("nf_report_detective", roles=["Detective"])
        chief = self._create_user("nf_report_chief", roles=["Chief"])
        case_obj = self._create_case(officer, severity=Case.Severity.LEVEL_2, status_value=Case.Status.OPEN)

        self.client.force_authenticate(detective)
        denied = self.client.get(reverse("case-comprehensive-report", kwargs={"case_id": case_obj.id}))
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(chief)
        allowed = self.client.get(reverse("case-comprehensive-report", kwargs={"case_id": case_obj.id}))
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertIn("case", allowed.data)
        self.assertIn("complaints", allowed.data)
        self.assertIn("evidence", allowed.data)
        self.assertIn("suspect_profiles", allowed.data)
        self.assertIn("involved_personnel", allowed.data)
        self.assertIn("board_snapshot", allowed.data)

    def test_case_closes_only_after_all_case_defendants_have_trials(self):
        officer = self._create_user("nf_multi_trial_officer", roles=["Police Officer"])
        judge = self._create_user("nf_multi_trial_judge", roles=["Judge"])
        suspect_a = self._create_user("nf_multi_trial_suspect_a", roles=["Suspect"])
        suspect_b = self._create_user("nf_multi_trial_suspect_b", roles=["Suspect"])

        case_obj = self._create_case(officer, severity=Case.Severity.LEVEL_2, status_value=Case.Status.IN_COURT)
        SuspectCaseProfile.objects.create(case=case_obj, suspect=suspect_a, is_arrested=True)
        SuspectCaseProfile.objects.create(case=case_obj, suspect=suspect_b, is_arrested=True)

        self.client.force_authenticate(judge)
        first_trial = self.client.post(
            reverse("trial-create"),
            {
                "case": case_obj.id,
                "defendant": suspect_a.id,
                "verdict": "innocent",
                "verdict_note": "Insufficient evidence against first defendant.",
            },
            format="json",
        )
        self.assertEqual(first_trial.status_code, status.HTTP_201_CREATED)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.IN_COURT)

        second_trial = self.client.post(
            reverse("trial-create"),
            {
                "case": case_obj.id,
                "defendant": suspect_b.id,
                "verdict": "guilty",
                "verdict_note": "Evidence proved second defendant.",
                "punishment_title": "Prison",
                "punishment_description": "Two years imprisonment",
            },
            format="json",
        )
        self.assertEqual(second_trial.status_code, status.HTTP_201_CREATED)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.CLOSED)
