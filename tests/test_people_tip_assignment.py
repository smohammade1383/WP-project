from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, SuspectCaseProfile
from people.models import CitizenTip
from users.models import User


class PeopleTipAssignmentTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 91000

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

    def _create_case_with_profile(self, created_by, suspect, assigned_detective=None):
        case_obj = Case.objects.create(
            title="Wanted suspect case",
            description="Case for tip assignment tests",
            location="District W",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_2,
            created_by=created_by,
            assigned_detective=assigned_detective,
        )
        profile = SuspectCaseProfile.objects.create(case=case_obj, suspect=suspect, arrest_warrant_issued=True)
        return case_obj, profile

    def test_officer_cannot_forward_tip_before_case_has_assigned_detective(self):
        reporter = self._create_user("tip_reporter", roles=["Basic User"])
        officer = self._create_user("tip_officer", roles=["Police Officer"])
        detective = self._create_user("tip_detective", roles=["Detective"])
        suspect = self._create_user("tip_suspect", roles=["Suspect"])

        case_obj, profile = self._create_case_with_profile(officer, suspect, assigned_detective=None)

        self.client.force_authenticate(reporter)
        tip_resp = self.client.post(
            reverse("people-tips"),
            {"suspect_profile": profile.id, "description": "Citizen says suspect seen near station."},
            format="json",
        )
        self.assertEqual(tip_resp.status_code, status.HTTP_201_CREATED)
        tip_id = tip_resp.data["id"]

        self.client.force_authenticate(officer)
        denied = self.client.post(
            reverse("people-tips-officer-review", kwargs={"tip_id": tip_id}),
            {"approved": True},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_400_BAD_REQUEST)

        case_obj.assigned_detective = detective
        case_obj.save(update_fields=["assigned_detective", "updated_at"])

        forwarded = self.client.post(
            reverse("people-tips-officer-review", kwargs={"tip_id": tip_id}),
            {"approved": True},
            format="json",
        )
        self.assertEqual(forwarded.status_code, status.HTTP_200_OK)
        self.assertEqual(forwarded.data["status"], CitizenTip.Status.DETECTIVE_REVIEW)
        self.assertEqual(forwarded.data["case"], case_obj.id)

    def test_only_assigned_detective_can_list_review_and_link_tip(self):
        reporter = self._create_user("tip_reporter_iso", roles=["Basic User"])
        officer = self._create_user("tip_officer_iso", roles=["Police Officer"])
        detective_owner = self._create_user("tip_detective_owner", roles=["Detective"])
        detective_other = self._create_user("tip_detective_other", roles=["Detective"])
        suspect = self._create_user("tip_suspect_iso", roles=["Suspect"])

        case_obj, profile = self._create_case_with_profile(
            officer,
            suspect,
            assigned_detective=detective_owner,
        )

        self.client.force_authenticate(reporter)
        tip_resp = self.client.post(
            reverse("people-tips"),
            {"suspect_profile": profile.id, "description": "Tip for the assigned detective only."},
            format="json",
        )
        self.assertEqual(tip_resp.status_code, status.HTTP_201_CREATED)
        tip_id = tip_resp.data["id"]

        self.client.force_authenticate(officer)
        self.assertEqual(
            self.client.post(
                reverse("people-tips-officer-review", kwargs={"tip_id": tip_id}),
                {"approved": True},
                format="json",
            ).status_code,
            status.HTTP_200_OK,
        )

        self.client.force_authenticate(detective_other)
        other_list = self.client.get(reverse("people-tips"))
        self.assertEqual(other_list.status_code, status.HTTP_200_OK)
        self.assertFalse(any(item["id"] == tip_id for item in other_list.data))

        other_review = self.client.post(
            reverse("people-tips-detective-review", kwargs={"tip_id": tip_id}),
            {"approved": True},
            format="json",
        )
        self.assertEqual(other_review.status_code, status.HTTP_403_FORBIDDEN)

        other_link = self.client.post(
            reverse("people-tips-link-case", kwargs={"tip_id": tip_id}),
            {"case_id": case_obj.id},
            format="json",
        )
        self.assertEqual(other_link.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(detective_owner)
        owner_list = self.client.get(reverse("people-tips"))
        self.assertEqual(owner_list.status_code, status.HTTP_200_OK)
        self.assertTrue(any(item["id"] == tip_id for item in owner_list.data))

        owner_review = self.client.post(
            reverse("people-tips-detective-review", kwargs={"tip_id": tip_id}),
            {"approved": True},
            format="json",
        )
        self.assertEqual(owner_review.status_code, status.HTTP_200_OK)

        another_case = Case.objects.create(
            title="Different case",
            description="Should be rejected for this tip",
            location="District X",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_2,
            created_by=officer,
            assigned_detective=detective_owner,
        )
        mismatch = self.client.post(
            reverse("people-tips-link-case", kwargs={"tip_id": tip_id}),
            {"case_id": another_case.id},
            format="json",
        )
        self.assertEqual(mismatch.status_code, status.HTTP_400_BAD_REQUEST)

        valid_link = self.client.post(
            reverse("people-tips-link-case", kwargs={"tip_id": tip_id}),
            {"case_id": case_obj.id},
            format="json",
        )
        self.assertEqual(valid_link.status_code, status.HTTP_200_OK)
        self.assertEqual(valid_link.data["status"], CitizenTip.Status.USEFUL)
        self.assertIsNotNone(valid_link.data["linked_evidence"])
        self.assertEqual(valid_link.data["case"], case_obj.id)

