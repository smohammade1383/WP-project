from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case
from evidence.models import Evidence


class EvidenceCreateTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="evidence_test_user",
            password="StrongPass123!",
            email="evidence_test_user@example.com",
            national_id="1234567890",
            phone_number="09121111111",
        )
        self.case = Case.objects.create(
            title="Evidence Create Test Case",
            description="Case for evidence creation",
            location="Tehran",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.COMPLAINT,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_3,
            created_by=self.user,
        )
        self.client.force_authenticate(self.user)

    def test_create_evidence_returns_201_and_sets_officer_review_defaults(self):
        response = self.client.post(
            "/api/evidence/",
            {
                "case": self.case.id,
                "title": "Public attachment",
                "description": "Citizen submitted evidence",
                "type": Evidence.Type.OTHER,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = Evidence.objects.get(id=response.data["id"])
        self.assertEqual(created.officer_review_status, Evidence.OfficerReviewStatus.PENDING)
        self.assertEqual(created.officer_review_message, "")
