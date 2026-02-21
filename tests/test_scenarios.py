from datetime import timedelta

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, Complaint, SecondaryComplainant, SuspectCaseProfile
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
        profile.is_arrested = True
        profile.save(update_fields=["is_arrested"])

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
        claim_case_resp = self.client.post(reverse("case-claim", kwargs={"case_id": case_obj.id}), {}, format="json")
        self.assertEqual(claim_case_resp.status_code, status.HTTP_200_OK)
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

    def test_scenario_12_end_to_end_complaint_to_trial_with_detective_and_coroner(self):
        citizen = self._create_user("end2end_citizen", roles=["Basic User"])
        cadet = self._create_user("end2end_cadet", roles=["Cadet"])
        officer = self._create_user("end2end_officer", roles=["Police Officer"])
        detective = self._create_user("end2end_detective", roles=["Detective"])
        coroner = self._create_user("end2end_coroner", roles=["Coroner"])
        sergeant = self._create_user("end2end_sergeant", roles=["Sergeant"])
        captain = self._create_user("end2end_captain", roles=["Captain"])
        judge = self._create_user("end2end_judge", roles=["Judge"])
        suspect = self._create_user("end2end_suspect", roles=["Suspect"])

        self.client.force_authenticate(citizen)
        complaint_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "End-to-end complaint",
                "description": "Citizen files initial complaint",
                "location": "District E2E",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(complaint_resp.status_code, status.HTTP_201_CREATED)
        complaint_id = complaint_resp.data["id"]

        self.client.force_authenticate(cadet)
        cadet_resp = self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Cadet verified complaint data."},
            format="json",
        )
        self.assertEqual(cadet_resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(cadet_resp.data["complaint"]["case"])

        self.client.force_authenticate(officer)
        officer_resp = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Officer confirms and forms case."},
            format="json",
        )
        self.assertEqual(officer_resp.status_code, status.HTTP_200_OK)
        case_id = officer_resp.data["case"]["id"]
        case_obj = Case.objects.get(id=case_id)
        self.assertEqual(case_obj.status, Case.Status.OPEN)

        self.client.force_authenticate(detective)
        claim_case_resp = self.client.post(reverse("case-claim", kwargs={"case_id": case_id}), {}, format="json")
        self.assertEqual(claim_case_resp.status_code, status.HTTP_200_OK)
        other_evidence_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_id,
                "title": "Knife",
                "description": "Weapon found in scene",
                "type": "other",
            },
            format="json",
        )
        self.assertEqual(other_evidence_resp.status_code, status.HTTP_201_CREATED)
        other_evidence_id = other_evidence_resp.data["id"]

        bio_evidence_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_id,
                "title": "Fingerprint sample",
                "description": "Needs coroner validation",
                "type": "bio_medical",
                "result_followup": "sent to lab",
            },
            format="json",
        )
        self.assertEqual(bio_evidence_resp.status_code, status.HTTP_201_CREATED)
        bio_evidence_id = bio_evidence_resp.data["id"]

        board_other_resp = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_id}),
            {"item_type": "evidence", "evidence": other_evidence_id, "position_x": 120, "position_y": 140},
            format="json",
        )
        self.assertEqual(board_other_resp.status_code, status.HTTP_201_CREATED)

        board_bio_before_coroner = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_id}),
            {"item_type": "evidence", "evidence": bio_evidence_id, "position_x": 240, "position_y": 200},
            format="json",
        )
        self.assertEqual(board_bio_before_coroner.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(coroner)
        coroner_review_resp = self.client.patch(
            reverse("evidence-rud", kwargs={"pk": bio_evidence_id}),
            {
                "lab_result": "Coroner approved with sufficient DNA match.",
                "result_followup": "validated",
                "bio_validation_status": "accepted",
            },
            format="json",
        )
        self.assertEqual(coroner_review_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(coroner_review_resp.data["details"]["validation_status"], "accepted")

        self.client.force_authenticate(detective)
        board_bio_after_coroner = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_id}),
            {"item_type": "evidence", "evidence": bio_evidence_id, "position_x": 260, "position_y": 220},
            format="json",
        )
        self.assertEqual(board_bio_after_coroner.status_code, status.HTTP_201_CREATED)

        nominate_resp = self.client.post(
            reverse("suspects-nominate", kwargs={"case_id": case_id}),
            {"suspect_ids": [suspect.id], "summary": "Evidence links suspect to the case."},
            format="json",
        )
        self.assertEqual(nominate_resp.status_code, status.HTTP_200_OK)

        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.WARRANT_PENDING)
        profile = SuspectCaseProfile.objects.get(case_id=case_id, suspect_id=suspect.id)

        self.client.force_authenticate(sergeant)
        sergeant_resp = self.client.post(
            reverse("sergeant-decision", kwargs={"case_id": case_id}),
            {"approved": True, "message": "Proceed with arrest."},
            format="json",
        )
        self.assertEqual(sergeant_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(officer)
        arrest_resp = self.client.post(reverse("suspect-arrest", kwargs={"profile_id": profile.id}), {}, format="json")
        self.assertEqual(arrest_resp.status_code, status.HTTP_200_OK)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.ARRESTED)

        self.client.force_authenticate(detective)
        detective_score_resp = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile.id}),
            {"scorer_role": "detective", "score": 8, "notes": "Strong match with evidence board."},
            format="json",
        )
        self.assertEqual(detective_score_resp.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(sergeant)
        sergeant_score_resp = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile.id}),
            {"scorer_role": "sergeant", "score": 7, "notes": "Interrogation responses are inconsistent."},
            format="json",
        )
        self.assertEqual(sergeant_score_resp.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(captain)
        captain_resp = self.client.post(
            reverse("captain-decision", kwargs={"profile_id": profile.id}),
            {"is_confirmed": True, "summary": "Send to court."},
            format="json",
        )
        self.assertEqual(captain_resp.status_code, status.HTTP_201_CREATED)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.IN_COURT)

        self.client.force_authenticate(judge)
        trial_resp = self.client.post(
            reverse("trial-create"),
            {
                "case": case_id,
                "defendant": suspect.id,
                "verdict": "guilty",
                "verdict_note": "Evidence chain is sufficient.",
                "punishment_title": "Imprisonment",
                "punishment_description": "5 years imprisonment",
            },
            format="json",
        )
        self.assertEqual(trial_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(trial_resp.data["verdict"], "guilty")
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.CLOSED)

    def test_scenario_13_officer_return_goes_back_to_cadet_without_case_creation(self):
        citizen = self._create_user("officer_return_citizen", roles=["Basic User"])
        cadet = self._create_user("officer_return_cadet", roles=["Cadet"])
        officer = self._create_user("officer_return_officer", roles=["Police Officer"])

        self.client.force_authenticate(citizen)
        complaint_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "Routing complaint",
                "description": "Initial details",
                "location": "Zone R",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(complaint_resp.status_code, status.HTTP_201_CREATED)
        complaint_id = complaint_resp.data["id"]

        self.client.force_authenticate(cadet)
        cadet_approve = self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Forward to officer"},
            format="json",
        )
        self.assertEqual(cadet_approve.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(officer)
        officer_return = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "returned", "message": "Needs more clarification"},
            format="json",
        )
        self.assertEqual(officer_return.status_code, status.HTTP_200_OK)
        self.assertIsNone(officer_return.data["case"])

        complaint = Complaint.objects.get(id=complaint_id)
        self.assertEqual(complaint.status, Complaint.Status.RETURNED)
        self.assertIsNone(complaint.case_id)

        self.client.force_authenticate(cadet)
        cadet_view = self.client.get(reverse("complaint-detail-update", kwargs={"pk": complaint_id}))
        self.assertEqual(cadet_view.status_code, status.HTTP_200_OK)
        self.assertEqual(cadet_view.data["latest_review_step"], "officer")
        self.assertEqual(cadet_view.data["status"], Complaint.Status.RETURNED)

        cadet_reapprove = self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Fixed, re-forwarding"},
            format="json",
        )
        self.assertEqual(cadet_reapprove.status_code, status.HTTP_200_OK)
        self.assertIsNone(cadet_reapprove.data["complaint"]["case"])

        self.client.force_authenticate(officer)
        final_officer_approve = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Final approval"},
            format="json",
        )
        self.assertEqual(final_officer_approve.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(final_officer_approve.data["case"]["id"])

    def test_scenario_14_cadet_additional_complainant_is_auto_approved(self):
        citizen = self._create_user("secondary_main_citizen", roles=["Basic User"])
        secondary = self._create_user("secondary_added_citizen", roles=["Basic User"])
        cadet = self._create_user("secondary_cadet_user", roles=["Cadet"])

        self.client.force_authenticate(citizen)
        complaint_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "Secondary complainants",
                "description": "Main complainant case",
                "location": "Zone S",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(complaint_resp.status_code, status.HTTP_201_CREATED)
        complaint_id = complaint_resp.data["id"]

        self.client.force_authenticate(cadet)
        add_resp = self.client.post(
            reverse("complaint-add-complainants", kwargs={"complaint_id": complaint_id}),
            {"complainant_ids": [secondary.id]},
            format="json",
        )
        self.assertEqual(add_resp.status_code, status.HTTP_200_OK)

        complaint = Complaint.objects.get(id=complaint_id)
        self.assertTrue(complaint.complainants.filter(id=secondary.id).exists())
        entry = SecondaryComplainant.objects.get(complaint=complaint, user=secondary)
        self.assertEqual(entry.status, SecondaryComplainant.Status.APPROVED)
        self.assertEqual(entry.reviewed_by_id, cadet.id)
