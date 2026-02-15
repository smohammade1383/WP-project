from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, Notification
from users.models import User


class OfficerEvidenceReviewAPITests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 70000

        self.officer = self._create_user("officer_reviewer", roles=["Police Officer"])
        self.detective = self._create_user("detective_user", roles=["Detective"])
        self.citizen = self._create_user("citizen_user", roles=["Basic User"])

        self.case = Case.objects.create(
            title="Evidence moderation case",
            description="Case for officer-review evidence flow",
            location="District A",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.COMPLAINT,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_2,
            created_by=self.officer,
        )

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

    def _create_citizen_evidence(self):
        self.client.force_authenticate(self.citizen)
        response = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": self.case.id,
                "title": "Citizen Uploaded Evidence",
                "description": "Potential witness material",
                "type": "other",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data

    @staticmethod
    def _extract_rows(payload):
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            rows = payload.get("results")
            if isinstance(rows, list):
                return rows
        return []

    def test_citizen_evidence_is_pending_and_visible_in_officer_queue(self):
        created = self._create_citizen_evidence()
        self.assertEqual(created["officer_review_status"], "pending")

        self.client.force_authenticate(self.officer)
        queue_response = self.client.get(reverse("evidence-officer-pending"))
        self.assertEqual(queue_response.status_code, status.HTTP_200_OK)
        queue_ids = {item["id"] for item in self._extract_rows(queue_response.data)}
        self.assertIn(created["id"], queue_ids)

    def test_detective_cannot_see_pending_evidence_until_officer_approval(self):
        created = self._create_citizen_evidence()

        self.client.force_authenticate(self.detective)
        before_approval = self.client.get(reverse("evidence-list-create"), {"case": self.case.id})
        self.assertEqual(before_approval.status_code, status.HTTP_200_OK)
        before_ids = {item["id"] for item in self._extract_rows(before_approval.data)}
        self.assertNotIn(created["id"], before_ids)

        self.client.force_authenticate(self.officer)
        approve_response = self.client.post(
            reverse("evidence-officer-review", kwargs={"pk": created["id"]}),
            {"decision": "approved"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)
        self.assertEqual(approve_response.data["officer_review_status"], "approved")

        self.client.force_authenticate(self.detective)
        after_approval = self.client.get(reverse("evidence-list-create"), {"case": self.case.id})
        self.assertEqual(after_approval.status_code, status.HTTP_200_OK)
        after_ids = {item["id"] for item in self._extract_rows(after_approval.data)}
        self.assertIn(created["id"], after_ids)

    def test_reject_requires_message_and_creates_notification_for_submitter(self):
        created = self._create_citizen_evidence()

        self.client.force_authenticate(self.officer)
        bad_reject = self.client.post(
            reverse("evidence-officer-review", kwargs={"pk": created["id"]}),
            {"decision": "rejected"},
            format="json",
        )
        self.assertEqual(bad_reject.status_code, status.HTTP_400_BAD_REQUEST)

        good_reject = self.client.post(
            reverse("evidence-officer-review", kwargs={"pk": created["id"]}),
            {"decision": "rejected", "message": "The uploaded file is unrelated to this case."},
            format="json",
        )
        self.assertEqual(good_reject.status_code, status.HTTP_200_OK)
        self.assertEqual(good_reject.data["officer_review_status"], "rejected")

        self.assertTrue(
            Notification.objects.filter(
                recipient=self.citizen,
                evidence_id=created["id"],
                message__contains="رد",
            ).exists()
        )
