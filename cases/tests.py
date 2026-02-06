from datetime import timedelta

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, Complaint, SuspectCaseProfile
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
        case_id = cadet_resp.data["complaint"]["case"]

        self.client.force_authenticate(officer)
        officer_resp = self.client.post(
            reverse("complaint-officer-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "approved", "message": "approved by officer"},
            format="json",
        )
        self.assertEqual(officer_resp.status_code, status.HTTP_200_OK)

        case_obj = Case.objects.get(id=case_id)
        complaint = Complaint.objects.get(id=complaint_id)
        self.assertEqual(case_obj.status, Case.Status.OPEN)
        self.assertEqual(case_obj.approved_by_id, officer.id)
        self.assertEqual(complaint.status, Complaint.Status.APPROVED)

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
