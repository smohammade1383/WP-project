from datetime import timedelta

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, SuspectCaseProfile
from users.models import User


class AdvancedEdgeCaseTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._user_seq = 5000

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

    def _create_case(self, created_by, severity=Case.Severity.LEVEL_2, status_value=Case.Status.OPEN):
        return Case.objects.create(
            title=f"Case-{severity}-{status_value}",
            description="Advanced edge case fixture",
            location="Test Zone",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=status_value,
            severity=severity,
            created_by=created_by,
        )

    def test_scenario_6_vehicle_evidence_xor_constraint(self):
        officer = self._create_user("vehicle_officer", roles=["Police Officer"])
        case_obj = self._create_case(created_by=officer, severity=Case.Severity.LEVEL_2)

        self.client.force_authenticate(officer)

        negative_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_obj.id,
                "title": "Illegal Vehicle Evidence",
                "description": "Both identifiers provided",
                "type": "vehicle",
                "vehicle_model": "Sedan",
                "vehicle_color": "Black",
                "license_plate": "123",
                "serial_number": "ABC",
            },
            format="json",
        )
        self.assertEqual(negative_resp.status_code, status.HTTP_400_BAD_REQUEST)

        plate_only_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_obj.id,
                "title": "Vehicle With Plate",
                "description": "Valid plate-only evidence",
                "type": "vehicle",
                "vehicle_model": "SUV",
                "vehicle_color": "White",
                "license_plate": "11الف11111",
            },
            format="json",
        )
        self.assertEqual(plate_only_resp.status_code, status.HTTP_201_CREATED)

        serial_only_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_obj.id,
                "title": "Vehicle With Serial",
                "description": "Valid serial-only evidence",
                "type": "vehicle",
                "vehicle_model": "Pickup",
                "vehicle_color": "Blue",
                "serial_number": "SER-4455",
            },
            format="json",
        )
        self.assertEqual(serial_only_resp.status_code, status.HTTP_201_CREATED)

    def test_scenario_7_critical_case_requires_chief_before_trial(self):
        detective = self._create_user("critical_detective", roles=["Detective"])
        captain = self._create_user("critical_captain", roles=["Captain"])
        chief = self._create_user("critical_chief", roles=["Chief"])
        judge = self._create_user("critical_judge", roles=["Judge"])
        suspect = self._create_user("critical_suspect")

        critical_case = self._create_case(
            created_by=detective,
            severity=Case.Severity.CRITICAL,
            status_value=Case.Status.ARRESTED,
        )
        suspect_profile = SuspectCaseProfile.objects.create(case=critical_case, suspect=suspect, is_arrested=True)

        self.client.force_authenticate(captain)
        captain_resp = self.client.post(
            reverse("captain-decision", kwargs={"profile_id": suspect_profile.id}),
            {"is_confirmed": True, "summary": "Captain recommends prosecution."},
            format="json",
        )
        self.assertEqual(captain_resp.status_code, status.HTTP_201_CREATED)
        decision_id = captain_resp.data["id"]

        self.client.force_authenticate(judge)
        premature_trial_resp = self.client.post(
            reverse("trial-create"),
            {
                "case": critical_case.id,
                "verdict": "guilty",
                "verdict_note": "Attempt before chief sign-off",
                "punishment_title": "Prison",
                "punishment_description": "Pending chief confirmation should block",
            },
            format="json",
        )
        self.assertEqual(premature_trial_resp.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(chief)
        chief_resp = self.client.post(
            reverse("chief-decision", kwargs={"decision_id": decision_id}),
            {"chief_confirmed": True, "summary": "Chief approved for court."},
            format="json",
        )
        self.assertEqual(chief_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(judge)
        valid_trial_resp = self.client.post(
            reverse("trial-create"),
            {
                "case": critical_case.id,
                "verdict": "guilty",
                "verdict_note": "Chief confirmed.",
                "punishment_title": "Long-term imprisonment",
                "punishment_description": "Final judgment after full sign-off",
            },
            format="json",
        )
        self.assertEqual(valid_trial_resp.status_code, status.HTTP_201_CREATED)

    def test_scenario_8_severe_tracking_time_logic(self):
        officer = self._create_user("wanted_officer", roles=["Police Officer"])
        suspect_35d = self._create_user("wanted_35_days")
        suspect_5d = self._create_user("wanted_5_days")

        case_35d = self._create_case(created_by=officer, severity=Case.Severity.LEVEL_1, status_value=Case.Status.OPEN)
        case_5d = self._create_case(created_by=officer, severity=Case.Severity.LEVEL_2, status_value=Case.Status.OPEN)

        profile_35d = SuspectCaseProfile.objects.create(case=case_35d, suspect=suspect_35d, is_arrested=False)
        profile_5d = SuspectCaseProfile.objects.create(case=case_5d, suspect=suspect_5d, is_arrested=False)

        SuspectCaseProfile.objects.filter(id=profile_35d.id).update(
            wanted_since=timezone.now() - timedelta(days=35)
        )
        SuspectCaseProfile.objects.filter(id=profile_5d.id).update(
            wanted_since=timezone.now() - timedelta(days=5)
        )

        severe_resp = self.client.get(reverse("severe-tracking-list"))
        self.assertEqual(severe_resp.status_code, status.HTTP_200_OK)

        severe_ids = {item["id"] for item in severe_resp.data}
        self.assertIn(profile_35d.id, severe_ids)
        self.assertNotIn(profile_5d.id, severe_ids)
