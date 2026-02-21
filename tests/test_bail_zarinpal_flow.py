from unittest.mock import patch

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, SuspectCaseProfile
from finance.models import PaymentTransaction
from users.models import User


class BailZarinPalFlowTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 7000

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

    def _create_arrested_profile(self):
        officer = self._create_user("zarin_officer", roles=["Police Officer"])
        sergeant = self._create_user("zarin_sergeant", roles=["Sergeant"])
        suspect = self._create_user("zarin_suspect", roles=["Suspect"])
        case_obj = Case.objects.create(
            title="Bail case",
            description="Bail payment integration",
            location="Zone-Z",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=Case.Severity.LEVEL_2,
            created_by=officer,
        )
        profile = SuspectCaseProfile.objects.create(
            case=case_obj,
            suspect=suspect,
            is_arrested=True,
        )
        return suspect, sergeant, profile

    @patch("finance.views.zarinpal_request_payment")
    def test_bail_request_returns_authority_and_creates_pending_transaction(self, mocked_request):
        suspect, sergeant, profile = self._create_arrested_profile()
        mocked_request.return_value = {
            "data": {
                "code": 100,
                "authority": "A000000000000000000000000000000001",
            }
        }

        self.client.force_authenticate(sergeant)
        init_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 2_000_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(init_resp.status_code, status.HTTP_201_CREATED)
        tx_id = init_resp.data["transaction"]["id"]

        self.client.force_authenticate(suspect)
        resp = self.client.post(
            reverse("bail-request"),
            {
                "transaction_id": tx_id,
                "description": "Bail request test",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("authority", resp.data)
        self.assertIn("start_url", resp.data)

        tx = PaymentTransaction.objects.get(id=resp.data["transaction"]["id"])
        self.assertEqual(tx.status, PaymentTransaction.Status.INITIATED)
        self.assertEqual(tx.gateway_reference, resp.data["authority"])
        self.assertEqual(tx.transaction_type, PaymentTransaction.TransactionType.BAIL)
        self.assertEqual(tx.suspect_profile_id, profile.id)

    @patch("finance.views.zarinpal_verify_payment")
    def test_bail_verify_success_marks_paid_and_releases_suspect(self, mocked_verify):
        suspect, _, profile = self._create_arrested_profile()
        tx = PaymentTransaction.objects.create(
            case=profile.case,
            suspect_profile=profile,
            payer=suspect,
            amount=3_000_000,
            transaction_type=PaymentTransaction.TransactionType.BAIL,
            status=PaymentTransaction.Status.INITIATED,
            gateway_reference="A000000000000000000000000000000002",
        )
        mocked_verify.return_value = {"data": {"code": 100, "ref_id": 1234567890}}

        resp = self.client.get(
            reverse("bail-verify"),
            {"Authority": tx.gateway_reference, "Status": "OK"},
        )
        self.assertEqual(resp.status_code, status.HTTP_302_FOUND)
        self.assertIn("payment=success", resp["Location"])

        tx.refresh_from_db()
        profile.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.PAID)
        self.assertFalse(profile.is_arrested)
        self.assertIsNotNone(tx.paid_at)

    def test_bail_verify_failed_status_marks_transaction_failed(self):
        suspect, _, profile = self._create_arrested_profile()
        tx = PaymentTransaction.objects.create(
            case=profile.case,
            suspect_profile=profile,
            payer=suspect,
            amount=1_500_000,
            transaction_type=PaymentTransaction.TransactionType.BAIL,
            status=PaymentTransaction.Status.INITIATED,
            gateway_reference="A000000000000000000000000000000003",
        )

        resp = self.client.get(
            reverse("bail-verify"),
            {"Authority": tx.gateway_reference, "Status": "NOK"},
        )
        self.assertEqual(resp.status_code, status.HTTP_302_FOUND)
        self.assertIn("payment=failed", resp["Location"])

        tx.refresh_from_db()
        profile.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.FAILED)
        self.assertTrue(profile.is_arrested)
