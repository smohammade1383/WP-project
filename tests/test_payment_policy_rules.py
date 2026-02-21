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
        profile.case.assigned_sergeant = sergeant
        profile.case.save(update_fields=["assigned_sergeant", "updated_at"])
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
        profile.case.assigned_sergeant = sergeant
        profile.case.save(update_fields=["assigned_sergeant", "updated_at"])
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

    @patch("finance.views.zarinpal_request_payment")
    def test_sergeant_cannot_pay_transaction_owned_by_suspect(self, mocked_request):
        mocked_request.return_value = {
            "data": {
                "code": 100,
                "authority": "A000000000000000000000000000000997",
            }
        }

        _, suspect, profile = self._create_profile(severity=Case.Severity.LEVEL_2, arrested=True)
        sergeant = self._create_user("sergeant_cannot_pay", roles=["Sergeant"])

        profile.case.assigned_sergeant = sergeant
        profile.case.save(update_fields=["assigned_sergeant", "updated_at"])

        self.client.force_authenticate(sergeant)
        init_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1_700_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(init_resp.status_code, status.HTTP_201_CREATED)
        tx_id = init_resp.data["transaction"]["id"]

        bail_denied = self.client.post(
            reverse("bail-request"),
            {"transaction_id": tx_id},
            format="json",
        )
        self.assertEqual(bail_denied.status_code, status.HTTP_403_FORBIDDEN)

        start_denied = self.client.post(
            reverse("payment-start", kwargs={"transaction_id": tx_id}),
            {},
            format="json",
        )
        self.assertEqual(start_denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(suspect)
        suspect_allowed = self.client.post(
            reverse("bail-request"),
            {"transaction_id": tx_id},
            format="json",
        )
        self.assertEqual(suspect_allowed.status_code, status.HTTP_201_CREATED)

    def test_paid_bail_does_not_force_rearrest_or_rescoring_for_captain_handoff(self):
        officer, suspect, profile = self._create_profile(severity=Case.Severity.LEVEL_2, arrested=True)
        detective = self._create_user("detective_bail_flow", roles=["Detective"])
        sergeant = self._create_user("sergeant_bail_flow", roles=["Sergeant"])

        case_obj = profile.case
        case_obj.assigned_detective = detective
        case_obj.assigned_sergeant = sergeant
        case_obj.status = Case.Status.ARRESTED
        case_obj.save(update_fields=["assigned_detective", "assigned_sergeant", "status", "updated_at"])

        profile.arrest_warrant_issued = True
        profile.save(update_fields=["arrest_warrant_issued"])

        self.client.force_authenticate(detective)
        detective_score = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile.id}),
            {"scorer_role": "detective", "score": 8, "notes": "Detective score before payment"},
            format="json",
        )
        self.assertEqual(detective_score.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(sergeant)
        sergeant_score = self.client.post(
            reverse("suspect-score", kwargs={"profile_id": profile.id}),
            {"scorer_role": "sergeant", "score": 7, "notes": "Sergeant score before payment"},
            format="json",
        )
        self.assertEqual(sergeant_score.status_code, status.HTTP_201_CREATED)

        init_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1_400_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(init_resp.status_code, status.HTTP_201_CREATED)
        tx_ref = init_resp.data["transaction"]["gateway_reference"]

        self.client.force_authenticate(None)
        callback_resp = self.client.post(
            reverse("payment-callback"),
            {
                "gateway_reference": tx_ref,
                "status": "paid",
                "payload": {"provider": "simulated", "trace": "ok"},
            },
            format="json",
        )
        self.assertEqual(callback_resp.status_code, status.HTTP_200_OK)

        profile.refresh_from_db()
        self.assertFalse(profile.is_arrested)
        self.assertFalse(profile.is_bail_allowed)
        self.assertIsNone(profile.bail_amount)

        self.client.force_authenticate(sergeant)
        submit_resp = self.client.post(
            reverse("submit-to-captain", kwargs={"case_id": case_obj.id}),
            {"message": "Scores are already complete, proceed after bail payment"},
            format="json",
        )
        self.assertEqual(submit_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_resp.data["case"]["status"], Case.Status.WAITING_CAPTAIN)
        self.assertEqual(submit_resp.data["submitted_profiles"], 1)

    def test_sergeant_cannot_reconfigure_bail_after_successful_payment(self):
        _, suspect, profile = self._create_profile(severity=Case.Severity.LEVEL_2, arrested=True)
        sergeant = self._create_user("sergeant_no_rebill", roles=["Sergeant"])
        case_obj = profile.case
        case_obj.assigned_sergeant = sergeant
        case_obj.save(update_fields=["assigned_sergeant", "updated_at"])

        self.client.force_authenticate(sergeant)
        init_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1_800_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(init_resp.status_code, status.HTTP_201_CREATED)
        tx_ref = init_resp.data["transaction"]["gateway_reference"]

        self.client.force_authenticate(None)
        paid_resp = self.client.post(
            reverse("payment-callback"),
            {
                "gateway_reference": tx_ref,
                "status": "paid",
                "payload": {"provider": "simulated", "trace": "paid"},
            },
            format="json",
        )
        self.assertEqual(paid_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(sergeant)
        denied_policy = self.client.post(
            reverse("suspect-bail-policy", kwargs={"profile_id": profile.id}),
            {"is_bail_allowed": True, "bail_amount": 2_000_000},
            format="json",
        )
        self.assertEqual(denied_policy.status_code, status.HTTP_400_BAD_REQUEST)

        denied_initiate = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 2_000_000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(denied_initiate.status_code, status.HTTP_400_BAD_REQUEST)
