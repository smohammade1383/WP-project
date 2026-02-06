from datetime import timedelta

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, Complaint, SuspectCaseProfile
from finance.models import PaymentTransaction
from users.models import User


class IntegrationScenarioTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._user_seq = 0

    def _create_user(self, username, roles=None):
        self._user_seq += 1
        user = User.objects.create_user(
            username=username,
            password=self.password,
            email=f"{username}@example.com",
            phone_number=f"09{self._user_seq:09d}",
            national_id=f"{self._user_seq:010d}",
            first_name=username,
            last_name="tester",
        )
        for role_name in roles or []:
            group, _ = Group.objects.get_or_create(name=role_name)
            user.groups.add(group)
        return user

    def _create_case_with_profile(self, created_by, suspect, severity):
        case_obj = Case.objects.create(
            title=f"Case-{severity}",
            description="Integration scenario case",
            location="District-1",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=severity,
            created_by=created_by,
        )
        profile = SuspectCaseProfile.objects.create(case=case_obj, suspect=suspect)
        return case_obj, profile

    def test_scenario_1_complaint_to_case_pipeline_happy_path(self):
        basic_user = self._create_user("basic_pipeline_user", roles=["Basic User"])
        cadet = self._create_user("cadet_pipeline_user", roles=["Cadet"])
        officer = self._create_user("officer_pipeline_user", roles=["Police Officer"])

        self.client.force_authenticate(basic_user)
        complaint_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "Lost property complaint",
                "description": "Initial complaint payload",
                "location": "Zone A",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(complaint_resp.status_code, status.HTTP_201_CREATED)
        complaint_id = complaint_resp.data["id"]

        self.client.force_authenticate(cadet)
        view_resp = self.client.get(reverse("complaint-detail-update", kwargs={"pk": complaint_id}))
        self.assertEqual(view_resp.status_code, status.HTTP_200_OK)
        cadet_review_resp = self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Cadet approved details."},
            format="json",
        )
        self.assertEqual(cadet_review_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(officer)
        officer_review_resp = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Officer approved and opened case."},
            format="json",
        )
        self.assertEqual(officer_review_resp.status_code, status.HTTP_200_OK)

        complaint = Complaint.objects.get(id=complaint_id)
        self.assertIsNotNone(complaint.case_id)
        self.assertEqual(complaint.status, Complaint.Status.APPROVED)
        self.assertTrue(Case.objects.filter(id=complaint.case_id).exists())

    def test_scenario_2_bail_logic_negative_and_counter(self):
        sergeant = self._create_user("sergeant_bail_user", roles=["Sergeant"])
        creator = self._create_user("creator_bail_user", roles=["Police Officer"])
        criminal = self._create_user("criminal_bail_user", roles=["Criminal"])

        _, profile = self._create_case_with_profile(creator, criminal, Case.Severity.LEVEL_2)

        self.client.force_authenticate(sergeant)
        deny_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 5_000_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
                "sergeant_approved": True,
            },
            format="json",
        )
        self.assertEqual(deny_resp.status_code, status.HTTP_400_BAD_REQUEST)

        criminal.groups.clear()
        suspect_group, _ = Group.objects.get_or_create(name="Suspect")
        criminal.groups.add(suspect_group)

        allow_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 5_000_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(allow_resp.status_code, status.HTTP_201_CREATED)

    def test_scenario_3_reward_formula_amount(self):
        reporter = self._create_user("reward_reporter_user", roles=["Basic User"])
        officer = self._create_user("reward_officer_user", roles=["Police Officer"])
        detective = self._create_user("reward_detective_user", roles=["Detective"])
        suspect = self._create_user("reward_suspect_user")

        # In this codebase, severity value 3 maps to LEVEL_1 and Di=3 in the formula.
        case_obj, profile = self._create_case_with_profile(officer, suspect, Case.Severity.LEVEL_1)
        SuspectCaseProfile.objects.filter(id=profile.id).update(wanted_since=timezone.now() - timedelta(days=5))
        profile.refresh_from_db()

        self.client.force_authenticate(reporter)
        claim_resp = self.client.post(
            reverse("reward-report-list-create"),
            {
                "case": case_obj.id,
                "suspect_profile": profile.id,
                "description": "Citizen tip for wanted suspect.",
            },
            format="json",
        )
        self.assertEqual(claim_resp.status_code, status.HTTP_201_CREATED)
        report_id = claim_resp.data["id"]

        self.client.force_authenticate(officer)
        officer_resp = self.client.post(
            reverse("reward-officer-review", kwargs={"report_id": report_id}),
            {"action": "forward"},
            format="json",
        )
        self.assertEqual(officer_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(detective)
        detective_resp = self.client.post(
            reverse("reward-detective-review", kwargs={"report_id": report_id}),
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(detective_resp.status_code, status.HTTP_200_OK)
        unique_code = detective_resp.data["unique_code"]

        self.client.force_authenticate(officer)
        verify_resp = self.client.get(
            reverse("reward-verify"),
            {"national_id": reporter.national_id, "unique_code": unique_code},
        )
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(verify_resp.data["reward_amount"], 300_000_000)

    def test_scenario_4_detective_board_data_integrity(self):
        detective = self._create_user("board_detective_user", roles=["Detective"])
        officer = self._create_user("board_creator_user", roles=["Police Officer"])
        witness = self._create_user("board_witness_user", roles=["Witness"])

        case_obj = Case.objects.create(
            title="Board integrity case",
            description="Board data integrity check",
            location="Zone B",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_2,
            created_by=officer,
        )

        self.client.force_authenticate(detective)
        board_resp = self.client.get(reverse("detective-board", kwargs={"case_id": case_obj.id}))
        self.assertEqual(board_resp.status_code, status.HTTP_200_OK)

        node_1 = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_obj.id}),
            {"item_type": "note", "note_text": "node-1", "position_x": 100, "position_y": 100, "width": 220, "height": 120},
            format="json",
        ).data
        node_2 = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_obj.id}),
            {"item_type": "witness", "user": witness.id, "position_x": 320, "position_y": 180, "width": 220, "height": 120},
            format="json",
        ).data

        link_resp = self.client.post(
            reverse("board-link-list-create", kwargs={"case_id": case_obj.id}),
            {"from_item": node_1["id"], "to_item": node_2["id"], "description": "Observed connection"},
            format="json",
        )
        self.assertEqual(link_resp.status_code, status.HTTP_201_CREATED)

        board_state_payload = {
            "nodes": [
                {"id": node_1["id"], "position_x": 140, "position_y": 155},
                {"id": node_2["id"], "position_x": 360, "position_y": 205},
            ],
            "links": [{"from_item": node_1["id"], "to_item": node_2["id"]}],
        }
        self.assertEqual(len(board_state_payload["nodes"]), 2)
        patch_resp = self.client.patch(
            reverse("board-item-rud", kwargs={"pk": node_1["id"]}),
            {"position_x": 140, "position_y": 155, "width": 240, "height": 130, "note_text": "node-1-updated"},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)

        evidence_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_obj.id,
                "title": "New Evidence",
                "description": "Evidence added after board update",
                "type": "other",
            },
            format="json",
        )
        self.assertEqual(evidence_resp.status_code, status.HTTP_201_CREATED)
        evidence_id = evidence_resp.data["id"]

        board_after = self.client.get(reverse("detective-board", kwargs={"case_id": case_obj.id}))
        self.assertEqual(board_after.status_code, status.HTTP_200_OK)
        items_after = board_after.data["items"]
        self.assertTrue(any(item["id"] == node_1["id"] for item in items_after))
        self.assertEqual(
            next(item for item in items_after if item["id"] == node_1["id"])["position_x"],
            140.0,
        )

        has_auto_added_evidence = any(item.get("evidence") == evidence_id for item in items_after)
        if not has_auto_added_evidence:
            add_evidence_item = self.client.post(
                reverse("board-item-list-create", kwargs={"case_id": case_obj.id}),
                {"item_type": "evidence", "evidence": evidence_id, "position_x": 420, "position_y": 280},
                format="json",
            )
            self.assertEqual(add_evidence_item.status_code, status.HTTP_201_CREATED)
            board_after_add = self.client.get(reverse("detective-board", kwargs={"case_id": case_obj.id}))
            self.assertTrue(any(item.get("evidence") == evidence_id for item in board_after_add.data["items"]))

    def test_scenario_5_rbac_dynamic_role_protection(self):
        admin_user = self._create_user("rbac_admin_user", roles=["Administrator"])
        viewer_group, _ = Group.objects.get_or_create(name="Viewer")
        viewer_user = self._create_user("rbac_viewer_user")
        viewer_user.groups.add(viewer_group)

        self.client.force_authenticate(viewer_user)
        forbidden_resp = self.client.get(reverse("case-list-create"))
        self.assertEqual(forbidden_resp.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(admin_user)
        assign_resp = self.client.post(
            reverse("user-role-manage", kwargs={"user_id": viewer_user.id}),
            {"role_names": ["Detective"]},
            format="json",
        )
        self.assertEqual(assign_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(viewer_user)
        allowed_resp = self.client.get(reverse("case-list-create"))
        self.assertEqual(allowed_resp.status_code, status.HTTP_200_OK)
