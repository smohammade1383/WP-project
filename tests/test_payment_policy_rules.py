from unittest.mock import patch

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, SuspectCaseProfile
from finance.models import PaymentTransaction
from users.models import User


class PaymentPolicyRulesTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 8100

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

    def _create_profile(self, *, severity, arrested):
        officer = self._create_user(f"officer_{self._seq}", roles=["Police Officer"])
        suspect = self._create_user(f"suspect_{self._seq}", roles=["Suspect"])
        case_obj = Case.objects.create(
            title="Payment policy case",
            description="Policy checks",
            location="Zone-P",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=severity,
            created_by=officer,
        )
        profile = SuspectCaseProfile.objects.create(case=case_obj, suspect=suspect, is_arrested=arrested)
        return officer, suspect, profile

    def test_only_sergeant_can_initiate_bail_transaction(self):
        officer, _, profile = self._create_profile(severity=Case.Severity.LEVEL_2, arrested=True)
        self.client.force_authenticate(officer)
        resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 2_500_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_payment_initiate_requires_arrested_suspect(self):
        _, _, profile = self._create_profile(severity=Case.Severity.LEVEL_2, arrested=False)
        sergeant = self._create_user("sergeant_policy", roles=["Sergeant"])
        self.client.force_authenticate(sergeant)
        resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 2_500_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_sergeant_can_update_bail_policy(self):
        officer, _, profile = self._create_profile(severity=Case.Severity.LEVEL_2, arrested=True)
        self.client.force_authenticate(officer)
        denied = self.client.post(
            reverse("suspect-bail-policy", kwargs={"profile_id": profile.id}),
            {"is_bail_allowed": True, "bail_amount": 2_200_000},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        sergeant = self._create_user("sergeant_policy_update", roles=["Sergeant"])
        self.client.force_authenticate(sergeant)
        allowed = self.client.post(
            reverse("suspect-bail-policy", kwargs={"profile_id": profile.id}),
            {"is_bail_allowed": True, "bail_amount": 2_200_000},
            format="json",
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        profile.refresh_from_db()
        self.assertTrue(profile.is_bail_allowed)
        self.assertEqual(profile.bail_amount, 2_200_000)

    @patch("finance.views.zarinpal_request_payment")
    def test_bail_request_rejects_when_policy_not_allowed(self, mocked_request):
        mocked_request.return_value = {"data": {"code": 100, "authority": "A-NEVER-USED"}}
        _, suspect, profile = self._create_profile(severity=Case.Severity.LEVEL_2, arrested=True)
        sergeant = self._create_user("sergeant_no_policy", roles=["Sergeant"])
        self.client.force_authenticate(sergeant)
        init_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1_500_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(init_resp.status_code, status.HTTP_201_CREATED)
        tx_id = init_resp.data["transaction"]["id"]

        # Sergeant turns bail policy off after creating the transaction.
        self.client.post(
            reverse("suspect-bail-policy", kwargs={"profile_id": profile.id}),
            {"is_bail_allowed": False},
            format="json",
        )

        self.client.force_authenticate(suspect)
        denied = self.client.post(
            reverse("bail-request"),
            {"transaction_id": tx_id},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("finance.views.zarinpal_request_payment")
    def test_suspect_can_pay_existing_transaction_but_cannot_create_amount_based_request(
        self, mocked_request
    ):
        mocked_request.return_value = {
            "data": {
                "code": 100,
                "authority": "A000000000000000000000000000000998",
            }
        }

        _, suspect, profile = self._create_profile(severity=Case.Severity.LEVEL_2, arrested=True)
        sergeant = self._create_user("sergeant_policy_pay", roles=["Sergeant"])

        self.client.force_authenticate(suspect)
        denied = self.client.post(
            reverse("bail-request"),
            {"suspect_profile": profile.id, "amount": 1_900_000},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(sergeant)
        init_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1_900_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(init_resp.status_code, status.HTTP_201_CREATED)
        tx_id = init_resp.data["transaction"]["id"]

        self.client.force_authenticate(suspect)
        allowed = self.client.post(
            reverse("bail-request"),
            {"transaction_id": tx_id},
            format="json",
        )
        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED)
        self.assertIn("authority", allowed.data)
        self.assertIn("start_url", allowed.data)
