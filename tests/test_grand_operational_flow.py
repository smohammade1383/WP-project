from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, Complaint
from users.models import User


class GrandOperationalFlowTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 12000

        self.citizen = self._create_user("flow_citizen", roles=["Basic User"])
        self.cadet = self._create_user("flow_cadet", roles=["Cadet"])
        self.officer = self._create_user("flow_officer", roles=["Police Officer"])
        self.detective = self._create_user("flow_detective", roles=["Detective"])
        self.coroner = self._create_user("flow_coroner", roles=["Coroner"])
        self.sergeant = self._create_user("flow_sergeant", roles=["Sergeant"])
        self.captain = self._create_user("flow_captain", roles=["Captain"])
        self.chief = self._create_user("flow_chief", roles=["Chief"])
        self.judge = self._create_user("flow_judge", roles=["Judge"])
        self.suspect = self._create_user("flow_suspect", roles=["Suspect"])

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

    def test_end_to_end_critical_case_flow(self):
        # Stage 1: Complaint intake -> cadet -> officer -> case created
        self.client.force_authenticate(self.citizen)
        complaint_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "Downtown serial incident",
                "description": "Suspicious repeated killings pattern.",
                "location": "Downtown",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(complaint_resp.status_code, status.HTTP_201_CREATED)
        complaint_id = complaint_resp.data["id"]

        self.client.force_authenticate(self.cadet)
        cadet_resp = self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Cadet intake passed."},
            format="json",
        )
        self.assertEqual(cadet_resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(cadet_resp.data["complaint"]["case"])

        self.client.force_authenticate(self.officer)
        officer_resp = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "Officer validated and opened case."},
            format="json",
        )
        self.assertEqual(officer_resp.status_code, status.HTTP_200_OK)
        case_id = officer_resp.data["case"]["id"]

        case_obj = Case.objects.get(id=case_id)
        self.assertEqual(case_obj.status, Case.Status.OPEN)
        self.assertEqual(Complaint.objects.get(id=complaint_id).status, Complaint.Status.APPROVED)

        self.client.force_authenticate(self.detective)
        claim_resp = self.client.post(reverse("case-claim", kwargs={"case_id": case_id}), {}, format="json")
        self.assertEqual(claim_resp.status_code, status.HTTP_200_OK)

        # Promote severity to CRITICAL so captain route escalates to chief.
        severity_resp = self.client.patch(
            reverse("case-detail-update", kwargs={"pk": case_id}),
            {"severity": Case.Severity.CRITICAL},
            format="json",
        )
        self.assertEqual(severity_resp.status_code, status.HTTP_200_OK)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.severity, Case.Severity.CRITICAL)

        # Stage 2: Detective creates bio evidence, coroner validates it.
        self.client.force_authenticate(self.detective)
        bio_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_id,
                "title": "DNA sample",
                "description": "Hair sample found at scene",
                "type": "bio_medical",
                "result_followup": "",
            },
            format="json",
        )
        self.assertEqual(bio_resp.status_code, status.HTTP_201_CREATED)
        evidence_id = bio_resp.data["id"]
        self.assertEqual(bio_resp.data["details"]["validation_status"], "pending")

        # Bio evidence should be blocked from board before coroner acceptance.
        blocked_board_item = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_id}),
            {
                "item_type": "evidence",
                "evidence": evidence_id,
                "position_x": 200,
                "position_y": 140,
            },
            format="json",
        )
        self.assertEqual(blocked_board_item.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(self.coroner)
        coroner_resp = self.client.patch(
            reverse("evidence-rud", kwargs={"pk": evidence_id}),
            {
                "bio_validation_status": "accepted",
                "lab_result": "DNA match established.",
                "result_followup": "Verified in national lab.",
            },
            format="json",
        )
        self.assertEqual(coroner_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(coroner_resp.data["details"]["validation_status"], "accepted")

        # Stage 3: Detective board + suspect nomination.
        self.client.force_authenticate(self.detective)
        note_resp = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_id}),
            {
                "item_type": "note",
                "note_text": "DNA and witness timeline converge.",
                "position_x": 120,
                "position_y": 110,
            },
            format="json",
        )
        self.assertEqual(note_resp.status_code, status.HTTP_201_CREATED)
        note_item_id = note_resp.data["id"]

        bio_item_resp = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_id}),
            {
                "item_type": "evidence",
                "evidence": evidence_id,
                "position_x": 360,
                "position_y": 220,
            },
            format="json",
        )
        self.assertEqual(bio_item_resp.status_code, status.HTTP_201_CREATED)
        bio_item_id = bio_item_resp.data["id"]

        link_resp = self.client.post(
            reverse("board-link-list-create", kwargs={"case_id": case_id}),
            {
                "from_item": note_item_id,
                "to_item": bio_item_id,
                "description": "Evidence supports detective hypothesis.",
            },
            format="json",
        )
        self.assertEqual(link_resp.status_code, status.HTTP_201_CREATED)

        nominate_resp = self.client.post(
            reverse("suspects-nominate", kwargs={"case_id": case_id}),
            {"suspect_ids": [self.suspect.id], "summary": "DNA and scene overlap."},
            format="json",
        )
        self.assertEqual(nominate_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(nominate_resp.data), 1)
        profile_id = nominate_resp.data[0]["id"]

        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.WARRANT_PENDING)

        # Stage 4: Sergeant decision, arrest, and both interrogation scores.
        self.client.force_authenticate(self.sergeant)
        sergeant_decision = self.client.post(
            reverse("sergeant-decision", kwargs={"case_id": case_id}),
            {"approved": True, "message": "Arrest warrant approved."},
            format="json",
        )
        self.assertEqual(sergeant_decision.status_code, status.HTTP_200_OK)

        arrest_resp = self.client.post(
            reverse("suspect-arrest", kwargs={"profile_id": profile_id}),
            {},
            format="json",
        )
        self.assertEqual(arrest_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(arrest_resp.data["is_arrested"])

        self.client.force_authenticate(self.detective)
        detective_score_resp = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile_id}),
            {"scorer_role": "detective", "score": 9, "notes": "Strong evidence chain."},
            format="json",
        )
        self.assertEqual(detective_score_resp.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(self.sergeant)
        sergeant_score_resp = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile_id}),
            {"scorer_role": "sergeant", "score": 8, "notes": "Interrogation corroborates."},
            format="json",
        )
        self.assertEqual(sergeant_score_resp.status_code, status.HTTP_201_CREATED)

        submit_captain_resp = self.client.post(
            reverse("submit-to-captain", kwargs={"case_id": case_id}),
            {"message": "Ready for command review."},
            format="json",
        )
        self.assertEqual(submit_captain_resp.status_code, status.HTTP_200_OK)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.WAITING_CAPTAIN)

        # Stage 5: Captain escalates critical case to chief.
        self.client.force_authenticate(self.captain)
        captain_resp = self.client.post(
            reverse("captain-decision", kwargs={"profile_id": profile_id}),
            {"is_confirmed": True, "summary": "Critical case, escalate to chief."},
            format="json",
        )
        self.assertEqual(captain_resp.status_code, status.HTTP_201_CREATED)
        decision_id = captain_resp.data["id"]
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.WAITING_CHIEF)

        # Stage 6: Chief reads dossier, confirms and sends to court.
        self.client.force_authenticate(self.chief)
        dossier_resp = self.client.get(
            reverse("case-comprehensive-report", kwargs={"case_id": case_id})
        )
        self.assertEqual(dossier_resp.status_code, status.HTTP_200_OK)
        self.assertIn("involved_personnel", dossier_resp.data)
        self.assertIn("board_snapshot", dossier_resp.data)
        self.assertIsNotNone(dossier_resp.data["board_snapshot"])

        chief_resp = self.client.post(
            reverse("chief-decision", kwargs={"decision_id": decision_id}),
            {"chief_confirmed": True, "summary": "Chief confirms prosecution."},
            format="json",
        )
        self.assertEqual(chief_resp.status_code, status.HTTP_200_OK)
        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.IN_COURT)

        # Stage 7: Judge final verdict closes case.
        self.client.force_authenticate(self.judge)
        trial_resp = self.client.post(
            reverse("trial-create"),
            {
                "case": case_id,
                "defendant": self.suspect.id,
                "verdict": "guilty",
                "verdict_note": "Evidence and interrogations were conclusive.",
                "punishment_title": "Life imprisonment",
                "punishment_description": "Without parole.",
            },
            format="json",
        )
        self.assertEqual(trial_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(trial_resp.data["verdict"], "guilty")
        self.assertEqual(trial_resp.data["defendant"], self.suspect.id)

        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.CLOSED)
