from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case
from users.models import User


class DetectiveAssignmentFlowTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 80000

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

    def _create_case(self, created_by, assigned_detective=None, status_value=Case.Status.OPEN):
        return Case.objects.create(
            title=f"DetectiveCase-{self._seq}",
            description="Case for assignment tests",
            location="Zone A",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=status_value,
            severity=Case.Severity.LEVEL_2,
            created_by=created_by,
            assigned_detective=assigned_detective,
        )

    def test_detective_sees_only_assigned_cases_in_main_list(self):
        officer = self._create_user("assign_officer_1", roles=["Police Officer"])
        detective_a = self._create_user("assign_detective_a_1", roles=["Detective"])
        detective_b = self._create_user("assign_detective_b_1", roles=["Detective"])

        mine = self._create_case(officer, assigned_detective=detective_a)
        self._create_case(officer, assigned_detective=detective_b)
        self._create_case(officer, assigned_detective=None)

        self.client.force_authenticate(detective_a)
        resp = self.client.get(reverse("case-list-create"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in resp.data}
        self.assertEqual(ids, {mine.id})

    def test_unassigned_pool_and_claim_workflow(self):
        officer = self._create_user("assign_officer_2", roles=["Police Officer"])
        detective = self._create_user("assign_detective_2", roles=["Detective"])

        unassigned_open = self._create_case(officer, assigned_detective=None, status_value=Case.Status.OPEN)
        self._create_case(officer, assigned_detective=None, status_value=Case.Status.PENDING_OFFICER)
        self._create_case(officer, assigned_detective=detective, status_value=Case.Status.OPEN)

        self.client.force_authenticate(detective)
        pool_resp = self.client.get(reverse("case-unassigned-list"))
        self.assertEqual(pool_resp.status_code, status.HTTP_200_OK)
        pool_ids = {item["id"] for item in pool_resp.data}
        self.assertEqual(pool_ids, {unassigned_open.id})

        claim_resp = self.client.post(reverse("case-claim", kwargs={"case_id": unassigned_open.id}), {}, format="json")
        self.assertEqual(claim_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(claim_resp.data["assigned_detective"]["id"], detective.id)

        unassigned_open.refresh_from_db()
        self.assertEqual(unassigned_open.assigned_detective_id, detective.id)

        pool_after = self.client.get(reverse("case-unassigned-list"))
        self.assertEqual(pool_after.status_code, status.HTTP_200_OK)
        self.assertFalse(any(item["id"] == unassigned_open.id for item in pool_after.data))

    def test_non_owner_detective_cannot_mutate_case(self):
        officer = self._create_user("assign_officer_3", roles=["Police Officer"])
        detective_owner = self._create_user("assign_detective_owner_3", roles=["Detective"])
        detective_other = self._create_user("assign_detective_other_3", roles=["Detective"])
        suspect = self._create_user("assign_suspect_3", roles=["Suspect"])

        case_obj = self._create_case(officer, assigned_detective=detective_owner)

        self.client.force_authenticate(detective_other)
        evidence_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_obj.id,
                "title": "Unauthorized evidence",
                "description": "Should be blocked",
                "type": "other",
            },
            format="json",
        )
        self.assertEqual(evidence_resp.status_code, status.HTTP_403_FORBIDDEN)

        board_resp = self.client.post(
            reverse("board-item-list-create", kwargs={"case_id": case_obj.id}),
            {
                "item_type": "note",
                "note_text": "Unauthorized board note",
                "position_x": 120,
                "position_y": 140,
            },
            format="json",
        )
        self.assertEqual(board_resp.status_code, status.HTTP_403_FORBIDDEN)

        nominate_resp = self.client.post(
            reverse("suspects-nominate", kwargs={"case_id": case_obj.id}),
            {"suspect_ids": [suspect.id], "summary": "Unauthorized nomination"},
            format="json",
        )
        self.assertEqual(nominate_resp.status_code, status.HTTP_403_FORBIDDEN)
