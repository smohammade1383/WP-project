from datetime import timedelta

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, SuspectCaseProfile
from evidence.models import Evidence
from users.models import User


class TipCaseLinkFlowTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 9300

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

    def test_tip_without_case_can_be_linked_by_detective_and_verified(self):
        citizen = self._create_user("tip_citizen", roles=["Basic User"])
        officer = self._create_user("tip_officer", roles=["Police Officer"])
        detective = self._create_user("tip_detective", roles=["Detective"])
        suspect = self._create_user("tip_suspect", roles=["Suspect"])

        case_obj = Case.objects.create(
            title="Tip target case",
            description="Case for linking tips",
            location="Zone-T",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_2,
            created_by=officer,
        )
        profile = SuspectCaseProfile.objects.create(case=case_obj, suspect=suspect)
        SuspectCaseProfile.objects.filter(id=profile.id).update(
            wanted_since=timezone.now() - timedelta(days=35)
        )
        profile.refresh_from_db()

        self.client.force_authenticate(citizen)
        submit = self.client.post(
            reverse("people-tips"),
            {
                "suspect_profile": profile.id,
                "description": "I saw the suspect near the old station last night.",
            },
            format="json",
        )
        self.assertEqual(submit.status_code, status.HTTP_201_CREATED)
        tip_id = submit.data["id"]
        self.assertIsNone(submit.data["case"])
        self.assertEqual(submit.data["status"], "officer_review")

        self.client.force_authenticate(officer)
        officer_review = self.client.post(
            reverse("people-tips-officer-review", kwargs={"tip_id": tip_id}),
            {"approved": True},
            format="json",
        )
        self.assertEqual(officer_review.status_code, status.HTTP_200_OK)
        self.assertEqual(officer_review.data["status"], "detective_review")

        self.client.force_authenticate(detective)
        linked = self.client.post(
            reverse("people-tips-link-case", kwargs={"tip_id": tip_id}),
            {"case_id": case_obj.id},
            format="json",
        )
        self.assertEqual(linked.status_code, status.HTTP_200_OK)
        self.assertEqual(linked.data["status"], "useful")
        self.assertEqual(linked.data["case"], case_obj.id)
        self.assertTrue(linked.data["tracking_code"])
        self.assertEqual(linked.data["reward_amount"], profile.reward_amount)
        self.assertIsNotNone(linked.data["linked_evidence"])

        evidence_exists = Evidence.objects.filter(
            id=linked.data["linked_evidence"],
            case=case_obj,
            type=Evidence.Type.OTHER,
            created_by=detective,
        ).exists()
        self.assertTrue(evidence_exists)

        self.client.force_authenticate(citizen)
        denied = self.client.get(
            reverse("reward-verify"),
            {"national_id": citizen.national_id, "tracking_code": linked.data["tracking_code"]},
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(officer)
        verified = self.client.get(
            reverse("reward-verify"),
            {"national_id": citizen.national_id, "tracking_code": linked.data["tracking_code"]},
        )
        self.assertEqual(verified.status_code, status.HTTP_200_OK)
        self.assertEqual(verified.data["source"], "citizen_tip")
        self.assertEqual(verified.data["reward_amount"], profile.reward_amount)
