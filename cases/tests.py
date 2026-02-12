from datetime import timedelta

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, Complaint, CrimeSceneWitness, SecondaryComplainant, SuspectCaseProfile
from users.models import User


class CaseFlowAPITests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"

    def _create_user(self, username, roles=None):
        idx = User.objects.count() + 1
        user = User.objects.create_user(
            username=username,
            password=self.password,
            email=f"{username}@example.com",
            phone_number=f"09{idx:09d}",
            national_id=f"{idx:010d}",
            first_name=username,
            last_name="tester",
        )
        for role_name in roles or []:
            group, _ = Group.objects.get_or_create(name=role_name)
            user.groups.add(group)
        return user

    def test_complaint_becomes_void_after_three_cadet_returns(self):
        citizen = self._create_user("citizen1")
        cadet = self._create_user("cadet1", roles=["Cadet"])

        self.client.force_authenticate(citizen)
        create_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "Noise and theft",
                "description": "Incident details",
                "location": "District 9",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        complaint_id = create_resp.data["id"]

        self.client.force_authenticate(cadet)
        for _ in range(3):
            review_resp = self.client.post(
                reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
                {"decision": "returned", "message": "missing details"},
                format="json",
            )
            self.assertEqual(review_resp.status_code, status.HTTP_200_OK)

        complaint = Complaint.objects.get(id=complaint_id)
        self.assertEqual(complaint.invalid_attempt_count, 3)
        self.assertEqual(complaint.status, Complaint.Status.VOID)

    def test_complaint_approved_by_cadet_and_officer_opens_case(self):
        citizen = self._create_user("citizen2")
        cadet = self._create_user("cadet2", roles=["Cadet"])
        officer = self._create_user("officer1", roles=["Police Officer"])

        self.client.force_authenticate(citizen)
        create_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "Robbery report",
                "description": "All details provided",
                "location": "Block A",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        complaint_id = create_resp.data["id"]

        self.client.force_authenticate(cadet)
        cadet_resp = self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "valid"},
            format="json",
        )
        self.assertEqual(cadet_resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(cadet_resp.data["complaint"]["case"])

        self.client.force_authenticate(officer)
        officer_resp = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "approved by officer"},
            format="json",
        )
        self.assertEqual(officer_resp.status_code, status.HTTP_200_OK)
        case_id = officer_resp.data["case"]["id"]

        case_obj = Case.objects.get(id=case_id)
        complaint = Complaint.objects.get(id=complaint_id)
        self.assertEqual(case_obj.status, Case.Status.OPEN)
        self.assertEqual(case_obj.approved_by_id, officer.id)
        self.assertEqual(complaint.status, Complaint.Status.APPROVED)

    def test_secondary_complainant_request_and_cadet_verification(self):
        citizen = self._create_user("citizen_secondary_1")
        secondary_user = self._create_user("citizen_secondary_2")
        cadet = self._create_user("cadet_secondary", roles=["Cadet"])

        self.client.force_authenticate(citizen)
        create_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "Complaint with secondary",
                "description": "Need additional complainant",
                "location": "Block S",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        complaint_id = create_resp.data["id"]

        request_resp = self.client.post(
            reverse("complaint-secondary-complainants-request", kwargs={"complaint_id": complaint_id}),
            {"complainant_ids": [secondary_user.id]},
            format="json",
        )
        self.assertEqual(request_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(request_resp.data[0]["status"], SecondaryComplainant.Status.PENDING)

        self.client.force_authenticate(cadet)
        list_resp = self.client.get(
            reverse("complaint-secondary-complainants", kwargs={"complaint_id": complaint_id})
        )
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        entry_id = list_resp.data[0]["id"]

        approve_resp = self.client.post(
            reverse(
                "complaint-secondary-complainants-review",
                kwargs={"complaint_id": complaint_id, "entry_id": entry_id},
            ),
            {"decision": "approved", "message": "Identity verified."},
            format="json",
        )
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK)

        complaint = Complaint.objects.get(id=complaint_id)
        self.assertTrue(complaint.complainants.filter(id=secondary_user.id).exists())

    def test_crime_scene_creation_stores_local_witness_contacts(self):
        officer = self._create_user("officer_local_witness", roles=["Police Officer"])
        self.client.force_authenticate(officer)

        create_resp = self.client.post(
            reverse("crime-scene-create"),
            {
                "title": "Street robbery",
                "description": "Reported by local witnesses",
                "location": "Zone W",
                "incident_datetime": timezone.now().isoformat(),
                "severity": Case.Severity.LEVEL_2,
                "local_witnesses": [
                    {"full_name": "Witness One", "national_id": "1234567890", "phone_number": "09120000001"},
                    {"full_name": "Witness Two", "national_id": "1234567891", "phone_number": "09120000002"},
                ],
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        case_id = create_resp.data["id"]
        self.assertEqual(len(create_resp.data["local_witnesses"]), 2)
        self.assertEqual(CrimeSceneWitness.objects.filter(case_id=case_id).count(), 2)

    def test_crime_scene_creation_by_officer_requires_approval(self):
        officer = self._create_user("officer2", roles=["Police Officer"])
        captain = self._create_user("captain1", roles=["Captain"])

        self.client.force_authenticate(officer)
        create_resp = self.client.post(
            reverse("crime-scene-create"),
            {
                "title": "Observed burglary",
                "description": "Field report",
                "location": "Zone B",
                "incident_datetime": timezone.now().isoformat(),
                "severity": Case.Severity.LEVEL_2,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        case_id = create_resp.data["id"]
        self.assertEqual(create_resp.data["status"], Case.Status.PENDING_OFFICER)

        self.client.force_authenticate(captain)
        approve_resp = self.client.post(reverse("crime-scene-approve", kwargs={"case_id": case_id}), {}, format="json")
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(approve_resp.data["status"], Case.Status.OPEN)

    def test_board_item_create_requires_detective_role(self):
        officer = self._create_user("officer3", roles=["Police Officer"])
        citizen = self._create_user("citizen3")
        detective = self._create_user("detective1", roles=["Detective"])

        case_obj = Case.objects.create(
            title="Investigation",
            description="Case file",
            location="Zone C",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_2,
            created_by=officer,
        )

        self.client.force_authenticate(citizen)
        denied = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_obj.id}),
            {"item_type": "note", "note_text": "Citizen note", "position_x": 100, "position_y": 100},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(detective)
        ok = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_obj.id}),
            {"item_type": "note", "note_text": "Detective note", "position_x": 100, "position_y": 100},
            format="json",
        )
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED)

    def test_severe_tracking_endpoint_marks_profiles_after_one_month(self):
        police = self._create_user("officer4", roles=["Police Officer"])
        suspect1 = self._create_user("suspect1")
        suspect2 = self._create_user("suspect2")

        case_high = Case.objects.create(
            title="Critical case",
            description="critical",
            location="Center",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.CRITICAL,
            created_by=police,
        )
        case_low = Case.objects.create(
            title="Petty case",
            description="petty",
            location="North",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_3,
            created_by=police,
        )

        profile_high = SuspectCaseProfile.objects.create(case=case_high, suspect=suspect1)
        profile_low = SuspectCaseProfile.objects.create(case=case_low, suspect=suspect2)
        SuspectCaseProfile.objects.filter(id=profile_high.id).update(wanted_since=timezone.now() - timedelta(days=40))
        SuspectCaseProfile.objects.filter(id=profile_low.id).update(wanted_since=timezone.now() - timedelta(days=35))

        self.client.force_authenticate(police)
        resp = self.client.get(reverse("severe-tracking-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(resp.data), 2)
        self.assertEqual(resp.data[0]["case"], case_high.id)
        self.assertTrue(resp.data[0]["severe_tracking"])
        self.assertGreater(resp.data[0]["ranking_score"], resp.data[1]["ranking_score"])

    def test_cadet_return_without_message_is_rejected(self):
        citizen = self._create_user("citizen4")
        cadet = self._create_user("cadet3", roles=["Cadet"])

        self.client.force_authenticate(citizen)
        create_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "Incomplete complaint",
                "description": "Desc",
                "location": "District 10",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        complaint_id = create_resp.data["id"]

        self.client.force_authenticate(cadet)
        review_resp = self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "returned", "message": ""},
            format="json",
        )
        self.assertEqual(review_resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_case_create_endpoint_for_police_works(self):
        officer = self._create_user("officer5", roles=["Police Officer"])
        self.client.force_authenticate(officer)

        resp = self.client.post(
            reverse("case-list-create"),
            {
                "title": "Direct case",
                "description": "Created by officer",
                "location": "Zone D",
                "incident_datetime": timezone.now().isoformat(),
                "source_type": Case.SourceType.CRIME_SCENE,
                "severity": Case.Severity.LEVEL_2,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["created_by"]["id"], officer.id)

    def test_critical_case_requires_chief_followup_after_captain_decision(self):
        captain = self._create_user("captain2", roles=["Captain"])
        chief = self._create_user("chief1", roles=["Chief"])
        detective = self._create_user("detective2", roles=["Detective"])
        suspect = self._create_user("suspect3")

        critical_case = Case.objects.create(
            title="Critical pursuit",
            description="Critical details",
            location="South",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.ARRESTED,
            severity=Case.Severity.CRITICAL,
            created_by=detective,
        )
        profile = SuspectCaseProfile.objects.create(case=critical_case, suspect=suspect, is_arrested=True)

        self.client.force_authenticate(captain)
        captain_resp = self.client.post(
            reverse("captain-decision", kwargs={"profile_id": profile.id}),
            {"is_confirmed": True, "summary": "send to chief"},
            format="json",
        )
        self.assertEqual(captain_resp.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(captain_resp.data["chief_confirmed"])

        critical_case.refresh_from_db()
        self.assertEqual(critical_case.status, Case.Status.WAITING_CHIEF)

        decision_id = captain_resp.data["id"]
        self.client.force_authenticate(chief)
        chief_resp = self.client.post(
            reverse("chief-decision", kwargs={"decision_id": decision_id}),
            {"chief_confirmed": True, "summary": "approved by chief"},
            format="json",
        )
        self.assertEqual(chief_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(chief_resp.data["chief_confirmed"])

        critical_case.refresh_from_db()
        self.assertEqual(critical_case.status, Case.Status.IN_COURT)

    def test_board_link_must_connect_items_from_same_board(self):
        detective = self._create_user("detective3", roles=["Detective"])
        officer = self._create_user("officer6", roles=["Police Officer"])

        case_a = Case.objects.create(
            title="Case A",
            description="A",
            location="A",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_2,
            created_by=officer,
        )
        case_b = Case.objects.create(
            title="Case B",
            description="B",
            location="B",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_2,
            created_by=officer,
        )

        self.client.force_authenticate(detective)
        item_a1 = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_a.id}),
            {"item_type": "note", "note_text": "a1", "position_x": 10, "position_y": 10},
            format="json",
        ).data["id"]
        item_a2 = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_a.id}),
            {"item_type": "note", "note_text": "a2", "position_x": 20, "position_y": 20},
            format="json",
        ).data["id"]
        item_b1 = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_b.id}),
            {"item_type": "note", "note_text": "b1", "position_x": 30, "position_y": 30},
            format="json",
        ).data["id"]

        ok_resp = self.client.post(
            reverse("board-link-list-create", kwargs={"case_id": case_a.id}),
            {"from_item": item_a1, "to_item": item_a2, "description": "valid"},
            format="json",
        )
        self.assertEqual(ok_resp.status_code, status.HTTP_201_CREATED)

        bad_resp = self.client.post(
            reverse("board-link-list-create", kwargs={"case_id": case_a.id}),
            {"from_item": item_a1, "to_item": item_b1, "description": "invalid"},
            format="json",
        )
        self.assertEqual(bad_resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sergeant_can_filter_suspect_profiles(self):
        sergeant = self._create_user("sergeant_profiles", roles=["Sergeant"])
        officer = self._create_user("officer_profiles", roles=["Police Officer"])
        suspect_a = self._create_user("suspect_profiles_a", roles=["Suspect"])
        suspect_b = self._create_user("suspect_profiles_b", roles=["Suspect"])

        case_a = Case.objects.create(
            title="Case Profile A",
            description="A",
            location="A",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.ARRESTED,
            severity=Case.Severity.LEVEL_2,
            created_by=officer,
        )
        case_b = Case.objects.create(
            title="Case Profile B",
            description="B",
            location="B",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_3,
            created_by=officer,
        )
        SuspectCaseProfile.objects.create(case=case_a, suspect=suspect_a, arrest_warrant_issued=True, is_arrested=True)
        SuspectCaseProfile.objects.create(case=case_b, suspect=suspect_b, arrest_warrant_issued=False, is_arrested=False)

        self.client.force_authenticate(sergeant)
        resp = self.client.get(
            reverse("suspect-profile-list"),
            {"case": case_a.id, "is_arrested": "true"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["case"], case_a.id)
        self.assertTrue(resp.data[0]["is_arrested"])

    def test_submit_to_captain_requires_both_detective_and_sergeant_scores(self):
        sergeant = self._create_user("sergeant_submit", roles=["Sergeant"])
        detective = self._create_user("detective_submit", roles=["Detective"])
        officer = self._create_user("officer_submit", roles=["Police Officer"])
        suspect = self._create_user("suspect_submit", roles=["Suspect"])

        case_obj = Case.objects.create(
            title="Submit to captain case",
            description="flow",
            location="Zone Q",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.ARRESTED,
            severity=Case.Severity.LEVEL_2,
            created_by=officer,
        )
        profile = SuspectCaseProfile.objects.create(
            case=case_obj,
            suspect=suspect,
            arrest_warrant_issued=True,
            is_arrested=True,
        )

        self.client.force_authenticate(sergeant)
        missing_resp = self.client.post(
            reverse("submit-to-captain", kwargs={"case_id": case_obj.id}),
            {"message": "ready"},
            format="json",
        )
        self.assertEqual(missing_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("missing_profiles", missing_resp.data)

        self.client.force_authenticate(detective)
        detective_score = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile.id}),
            {"scorer_role": "detective", "score": 8, "notes": "Detective score"},
            format="json",
        )
        self.assertEqual(detective_score.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(sergeant)
        sergeant_score = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile.id}),
            {"scorer_role": "sergeant", "score": 7, "notes": "Sergeant score"},
            format="json",
        )
        self.assertEqual(sergeant_score.status_code, status.HTTP_201_CREATED)

        submit_resp = self.client.post(
            reverse("submit-to-captain", kwargs={"case_id": case_obj.id}),
            {"message": "sent to captain queue"},
            format="json",
        )
        self.assertEqual(submit_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_resp.data["submitted_profiles"], 1)
        self.assertEqual(submit_resp.data["case"]["status"], Case.Status.WAITING_CAPTAIN)

    def test_captain_reject_returns_case_to_sergeant_queue(self):
        captain = self._create_user("captain_reject_case", roles=["Captain"])
        officer = self._create_user("officer_reject_case", roles=["Police Officer"])
        suspect = self._create_user("suspect_reject_case", roles=["Suspect"])

        case_obj = Case.objects.create(
            title="Captain reject case",
            description="Queue",
            location="Zone C",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.WAITING_CAPTAIN,
            severity=Case.Severity.LEVEL_2,
            created_by=officer,
        )
        profile = SuspectCaseProfile.objects.create(
            case=case_obj,
            suspect=suspect,
            arrest_warrant_issued=True,
            is_arrested=True,
        )

        self.client.force_authenticate(captain)
        reject_resp = self.client.post(
            reverse("captain-decision", kwargs={"profile_id": profile.id}),
            {"is_confirmed": False, "summary": "Needs more review."},
            format="json",
        )
        self.assertEqual(reject_resp.status_code, status.HTTP_201_CREATED)

        case_obj.refresh_from_db()
        self.assertEqual(case_obj.status, Case.Status.ARRESTED)
