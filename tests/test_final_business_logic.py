from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, Complaint
from finance.models import PaymentTransaction
from users.models import User


class FinalBusinessLogicTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 9000

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

    def _create_case(self, created_by, severity=Case.Severity.LEVEL_2, assigned_detective=None):
        return Case.objects.create(
            title=f"Case-{severity}",
            description="Test case",
            location="Test Zone",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=severity,
            created_by=created_by,
            assigned_detective=assigned_detective,
        )

    def test_scenario_9_three_strikes_rule(self):
        complainant = self._create_user("three_strikes_complainant", roles=["Basic User"])
        cadet = self._create_user("three_strikes_cadet", roles=["Cadet"])

        self.client.force_authenticate(complainant)
        complaint_resp = self.client.post(
            reverse("complaint-list-create"),
            {
                "title": "Three strikes complaint",
                "description": "Initial description",
                "location": "Zone-1",
                "incident_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(complaint_resp.status_code, status.HTTP_201_CREATED)
        complaint_id = complaint_resp.data["id"]

        for attempt in (1, 2):
            self.client.force_authenticate(cadet)
            review_resp = self.client.post(
                reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
                {"decision": "returned", "message": f"Fix required, attempt {attempt}"},
                format="json",
            )
            self.assertEqual(review_resp.status_code, status.HTTP_200_OK)

            self.client.force_authenticate(complainant)
            resubmit_resp = self.client.patch(
                reverse("complaint-detail-update", kwargs={"pk": complaint_id}),
                {"description": f"Updated description after attempt {attempt}"},
                format="json",
            )
            self.assertEqual(resubmit_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(cadet)
        third_review_resp = self.client.post(
            reverse("complaint-cadet-review", kwargs={"complaint_id": complaint_id}),
            {"decision": "returned", "message": "Third return"},
            format="json",
        )
        self.assertEqual(third_review_resp.status_code, status.HTTP_200_OK)

        complaint = Complaint.objects.get(id=complaint_id)
        self.assertEqual(complaint.status, Complaint.Status.VOID)
        self.assertEqual(complaint.invalid_attempt_count, 3)

        self.client.force_authenticate(complainant)
        invalid_resubmit = self.client.patch(
            reverse("complaint-detail-update", kwargs={"pk": complaint_id}),
            {"description": "Trying to resubmit after VOID"},
            format="json",
        )
        self.assertEqual(invalid_resubmit.status_code, status.HTTP_400_BAD_REQUEST)

    def test_scenario_10_payment_gateway_callback_logic(self):
        tx_success = PaymentTransaction.objects.create(
            amount=1_000_000,
            transaction_type=PaymentTransaction.TransactionType.BAIL,
            status=PaymentTransaction.Status.INITIATED,
            gateway_reference="GW-SUCCESS-001",
        )

        success_callback = self.client.post(
            reverse("payment-callback"),
            {
                "transaction_id": tx_success.id,
                "status": 1,
                "payload": {"provider": "mock", "result": "OK"},
            },
            format="json",
        )
        self.assertEqual(success_callback.status_code, status.HTTP_200_OK)
        tx_success.refresh_from_db()
        self.assertEqual(tx_success.status, PaymentTransaction.Status.PAID)

        tx_fail = PaymentTransaction.objects.create(
            amount=1_000_000,
            transaction_type=PaymentTransaction.TransactionType.BAIL,
            status=PaymentTransaction.Status.INITIATED,
            gateway_reference="GW-FAIL-001",
        )
        fail_callback = self.client.post(
            reverse("payment-callback"),
            {
                "transaction_id": tx_fail.id,
                "status": 0,
                "payload": {"provider": "mock", "result": "FAILED"},
            },
            format="json",
        )
        self.assertEqual(fail_callback.status_code, status.HTTP_200_OK)
        tx_fail.refresh_from_db()
        self.assertEqual(tx_fail.status, PaymentTransaction.Status.FAILED)

    def test_scenario_11_evidence_tampering_protection(self):
        detective = self._create_user("tamper_detective", roles=["Detective"])
        officer = self._create_user("tamper_officer", roles=["Police Officer"])

        case_obj = self._create_case(
            created_by=officer,
            severity=Case.Severity.LEVEL_2,
            assigned_detective=detective,
        )

        self.client.force_authenticate(detective)
        create_evidence_resp = self.client.post(
            reverse("evidence-list-create"),
            {
                "case": case_obj.id,
                "title": "Gun",
                "description": "Detected weapon evidence",
                "type": "other",
            },
            format="json",
        )
        self.assertEqual(create_evidence_resp.status_code, status.HTTP_201_CREATED)
        evidence_id = create_evidence_resp.data["id"]

        self.client.force_authenticate(officer)
        forbidden_delete = self.client.delete(reverse("evidence-rud", kwargs={"pk": evidence_id}))
        self.assertEqual(forbidden_delete.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(detective)
        owner_delete = self.client.delete(reverse("evidence-rud", kwargs={"pk": evidence_id}))
        self.assertEqual(owner_delete.status_code, status.HTTP_204_NO_CONTENT)
