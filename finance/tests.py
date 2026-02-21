from django.contrib.auth.models import Group
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, DetectiveBoard, SuspectCaseProfile
from finance.models import PaymentTransaction, RewardReport
from users.models import User


class FinanceFlowAPITests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"

    def _create_user(self, username, roles=None):
        idx = User.objects.count() + 100
        user = User.objects.create_user(
            username=username,
            password=self.password,
            email=f"{username}@example.com",
            phone_number=f"09{idx:09d}",
            national_id=f"{idx:010d}",
            first_name=username,
            last_name="tester",
        )
        for role_name in roles or []:
            group, _ = Group.objects.get_or_create(name=role_name)
            user.groups.add(group)
        return user

    def _create_case_and_profile(self, creator, suspect, severity, suspect_roles=None):
        for role in suspect_roles or []:
            group, _ = Group.objects.get_or_create(name=role)
            suspect.groups.add(group)

        case_obj = Case.objects.create(
            title=f"Case {severity}",
            description="desc",
            location="zone",
            incident_datetime="2026-02-01T10:00:00Z",
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=severity,
            created_by=creator,
        )
        return case_obj, SuspectCaseProfile.objects.create(case=case_obj, suspect=suspect)

    def _assign_detective(self, case_obj, detective):
        DetectiveBoard.objects.update_or_create(
            case=case_obj,
            defaults={"detective": detective},
        )

    def test_reward_approval_generates_code_and_amount(self):
        reporter = self._create_user("reporter1")
        officer = self._create_user("officer1", roles=["Police Officer"])
        detective = self._create_user("detective1", roles=["Detective"])
        suspect = self._create_user("suspect1")
        case_obj, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)
        self._assign_detective(case_obj, detective)

        self.client.force_authenticate(reporter)
        create_resp = self.client.post(
            reverse("reward-report-list-create"),
            {
                "case": profile.case_id,
                "suspect_profile": profile.id,
                "description": "Useful lead",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        report_id = create_resp.data["id"]

        self.client.force_authenticate(officer)
        officer_resp = self.client.post(
            reverse("reward-officer-review", kwargs={"report_id": report_id}),
            {"action": "forward"},
            format="json",
        )
        self.assertEqual(officer_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(officer_resp.data["status"], RewardReport.Status.DETECTIVE_REVIEW)

        self.client.force_authenticate(detective)
        detective_resp = self.client.post(
            reverse("reward-detective-review", kwargs={"report_id": report_id}),
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(detective_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(detective_resp.data["status"], RewardReport.Status.APPROVED)
        self.assertTrue(detective_resp.data["unique_code"])
        self.assertEqual(detective_resp.data["reward_amount"], profile.reward_amount)

    def test_reward_verify_requires_police_role(self):
        reporter = self._create_user("reporter2")
        officer = self._create_user("officer2", roles=["Police Officer"])
        detective = self._create_user("detective2", roles=["Detective"])
        suspect = self._create_user("suspect2")
        case_obj, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)
        self._assign_detective(case_obj, detective)

        self.client.force_authenticate(reporter)
        create_resp = self.client.post(
            reverse("reward-report-list-create"),
            {"case": profile.case_id, "suspect_profile": profile.id, "description": "tip"},
            format="json",
        )
        report_id = create_resp.data["id"]

        self.client.force_authenticate(officer)
        self.client.post(reverse("reward-officer-review", kwargs={"report_id": report_id}), {"action": "forward"}, format="json")
        self.client.force_authenticate(detective)
        approved = self.client.post(reverse("reward-detective-review", kwargs={"report_id": report_id}), {"action": "approve"}, format="json")
        code = approved.data["unique_code"]

        self.client.force_authenticate(reporter)
        denied = self.client.get(reverse("reward-verify"), {"national_id": reporter.national_id, "unique_code": code})
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(officer)
        ok = self.client.get(reverse("reward-verify"), {"national_id": reporter.national_id, "unique_code": code})
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertEqual(ok.data["reporter"]["national_id"], reporter.national_id)

    def test_sergeant_cannot_do_officer_stage_reward_review(self):
        reporter = self._create_user("reporter_sergeant_block")
        sergeant = self._create_user("sergeant_block", roles=["Sergeant"])
        officer = self._create_user("officer_block", roles=["Police Officer"])
        suspect = self._create_user("suspect_block")
        case_obj, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)

        self.client.force_authenticate(reporter)
        create_resp = self.client.post(
            reverse("reward-report-list-create"),
            {
                "case": case_obj.id,
                "suspect_profile": profile.id,
                "description": "tip for role guard",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        report_id = create_resp.data["id"]

        self.client.force_authenticate(sergeant)
        denied = self.client.post(
            reverse("reward-officer-review", kwargs={"report_id": report_id}),
            {"action": "forward"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_reward_detective_review_is_limited_to_assigned_detective(self):
        reporter = self._create_user("reporter3")
        officer = self._create_user("officer3a", roles=["Police Officer"])
        assigned_detective = self._create_user("detective_assigned", roles=["Detective"])
        other_detective = self._create_user("detective_other", roles=["Detective"])
        suspect = self._create_user("suspect3a")
        case_obj, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)
        self._assign_detective(case_obj, assigned_detective)

        self.client.force_authenticate(reporter)
        create_resp = self.client.post(
            reverse("reward-report-list-create"),
            {"case": profile.case_id, "suspect_profile": profile.id, "description": "tip"},
            format="json",
        )
        report_id = create_resp.data["id"]

        self.client.force_authenticate(officer)
        forward_resp = self.client.post(
            reverse("reward-officer-review", kwargs={"report_id": report_id}),
            {"action": "forward"},
            format="json",
        )
        self.assertEqual(forward_resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(other_detective)
        denied_resp = self.client.post(
            reverse("reward-detective-review", kwargs={"report_id": report_id}),
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(denied_resp.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(assigned_detective)
        ok_resp = self.client.post(
            reverse("reward-detective-review", kwargs={"report_id": report_id}),
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(ok_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(ok_resp.data["status"], RewardReport.Status.APPROVED)

    def test_reward_case_level_submission_without_suspect_profile_is_supported(self):
        reporter = self._create_user("reporter4")
        officer = self._create_user("officer4a", roles=["Police Officer"])
        detective = self._create_user("detective4a", roles=["Detective"])
        suspect = self._create_user("suspect4a")
        case_obj, _ = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)
        self._assign_detective(case_obj, detective)

        self.client.force_authenticate(reporter)
        create_resp = self.client.post(
            reverse("reward-report-list-create"),
            {
                "case": case_obj.id,
                "description": "General case-level useful information",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        report_id = create_resp.data["id"]

        self.client.force_authenticate(officer)
        forward_resp = self.client.post(
            reverse("reward-officer-review", kwargs={"report_id": report_id}),
            {"action": "forward"},
            format="json",
        )
        self.assertEqual(forward_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(forward_resp.data["status"], RewardReport.Status.DETECTIVE_REVIEW)

        self.client.force_authenticate(detective)
        approve_resp = self.client.post(
            reverse("reward-detective-review", kwargs={"report_id": report_id}),
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(approve_resp.data["status"], RewardReport.Status.APPROVED)
        self.assertTrue(approve_resp.data["unique_code"])

    def test_payment_initiate_allows_level2_suspect(self):
        officer = self._create_user("officer3", roles=["Police Officer"])
        suspect = self._create_user("suspect3")
        _, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)

        self.client.force_authenticate(officer)
        resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 2500000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
                "return_url": "https://example.com/payment-return",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["transaction"]["status"], PaymentTransaction.Status.INITIATED)

    def test_payment_initiate_rejects_invalid_severity_for_suspect(self):
        officer = self._create_user("officer4", roles=["Police Officer"])
        suspect = self._create_user("suspect4")
        _, profile = self._create_case_and_profile(officer, suspect, Case.Severity.CRITICAL)

        self.client.force_authenticate(officer)
        resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1000000,
                "transaction_type": PaymentTransaction.TransactionType.FINE,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_payment_initiate_criminal_level3_requires_sergeant_approval(self):
        officer = self._create_user("officer5", roles=["Police Officer"])
        criminal = self._create_user("criminal1", roles=["Criminal"])
        _, profile = self._create_case_and_profile(officer, criminal, Case.Severity.LEVEL_3)

        self.client.force_authenticate(officer)
        denied = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1800000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_400_BAD_REQUEST)

        allowed = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1800000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
                "sergeant_approved": True,
            },
            format="json",
        )
        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED)

    def test_payment_callback_updates_transaction_status(self):
        officer = self._create_user("officer6", roles=["Police Officer"])
        suspect = self._create_user("suspect6")
        _, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)

        self.client.force_authenticate(officer)
        init_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1200000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        tx_reference = init_resp.data["transaction"]["gateway_reference"]

        self.client.force_authenticate(None)
        callback_resp = self.client.post(
            reverse("payment-callback"),
            {
                "gateway_reference": tx_reference,
                "status": "paid",
                "payload": {"provider": "simulated", "trace": "ok"},
            },
            format="json",
        )
        self.assertEqual(callback_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(callback_resp.data["status"], PaymentTransaction.Status.PAID)

    def test_suspect_can_list_and_start_own_payment(self):
        officer = self._create_user("officer7", roles=["Police Officer"])
        suspect = self._create_user("suspect7")
        _, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)

        self.client.force_authenticate(officer)
        init_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1500000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        self.assertEqual(init_resp.status_code, status.HTTP_201_CREATED)
        tx_id = init_resp.data["transaction"]["id"]

        self.client.force_authenticate(suspect)
        list_resp = self.client.get(reverse("payment-list"))
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(any(item["id"] == tx_id for item in list_resp.data))

        start_resp = self.client.post(reverse("payment-start", kwargs={"transaction_id": tx_id}), {}, format="json")
        self.assertEqual(start_resp.status_code, status.HTTP_200_OK)
        self.assertIn("/api/finance/payments/", start_resp.data["payment_url"])

    def test_paid_bail_releases_arrest_status(self):
        officer = self._create_user("officer8", roles=["Police Officer"])
        suspect = self._create_user("suspect8")
        _, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)
        profile.is_arrested = True
        profile.save(update_fields=["is_arrested"])

        self.client.force_authenticate(officer)
        init_resp = self.client.post(
            reverse("payment-initiate"),
            {
                "suspect_profile": profile.id,
                "amount": 1600000,
                "transaction_type": PaymentTransaction.TransactionType.BAIL,
            },
            format="json",
        )
        tx_reference = init_resp.data["transaction"]["gateway_reference"]

        self.client.force_authenticate(None)
        callback_resp = self.client.post(
            reverse("payment-callback"),
            {
                "gateway_reference": tx_reference,
                "status": "paid",
                "payload": {"provider": "simulated", "trace": "ok"},
            },
            format="json",
        )
        self.assertEqual(callback_resp.status_code, status.HTTP_200_OK)
        profile.refresh_from_db()
        self.assertFalse(profile.is_arrested)

    def test_officer_forward_requires_assigned_detective(self):
        reporter = self._create_user("reporter_no_board")
        officer = self._create_user("officer_no_board", roles=["Police Officer"])
        suspect = self._create_user("suspect_no_board")
        case_obj, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)

        self.client.force_authenticate(reporter)
        create_resp = self.client.post(
            reverse("reward-report-list-create"),
            {
                "case": case_obj.id,
                "suspect_profile": profile.id,
                "description": "No detective assigned yet",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        report_id = create_resp.data["id"]

        self.client.force_authenticate(officer)
        forward_resp = self.client.post(
            reverse("reward-officer-review", kwargs={"report_id": report_id}),
            {"action": "forward"},
            format="json",
        )
        self.assertEqual(forward_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", forward_resp.data)

    def test_detective_list_only_contains_assigned_reports(self):
        reporter = self._create_user("reporter_queue")
        officer = self._create_user("officer_queue", roles=["Police Officer"])
        detective_a = self._create_user("detective_a", roles=["Detective"])
        detective_b = self._create_user("detective_b", roles=["Detective"])

        suspect_a = self._create_user("suspect_a")
        case_a, profile_a = self._create_case_and_profile(officer, suspect_a, Case.Severity.LEVEL_2)
        self._assign_detective(case_a, detective_a)

        suspect_b = self._create_user("suspect_b")
        case_b, profile_b = self._create_case_and_profile(officer, suspect_b, Case.Severity.LEVEL_2)
        self._assign_detective(case_b, detective_b)

        self.client.force_authenticate(reporter)
        r1 = self.client.post(
            reverse("reward-report-list-create"),
            {"case": case_a.id, "suspect_profile": profile_a.id, "description": "tip A"},
            format="json",
        )
        r2 = self.client.post(
            reverse("reward-report-list-create"),
            {"case": case_b.id, "suspect_profile": profile_b.id, "description": "tip B"},
            format="json",
        )
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(officer)
        self.client.post(
            reverse("reward-officer-review", kwargs={"report_id": r1.data["id"]}),
            {"action": "forward"},
            format="json",
        )
        self.client.post(
            reverse("reward-officer-review", kwargs={"report_id": r2.data["id"]}),
            {"action": "forward"},
            format="json",
        )

        self.client.force_authenticate(detective_a)
        detective_list = self.client.get(reverse("reward-report-list-create"))
        self.assertEqual(detective_list.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in detective_list.data}
        self.assertIn(r1.data["id"], ids)
        self.assertNotIn(r2.data["id"], ids)

    def test_reward_verify_tracking_code_is_case_insensitive(self):
        reporter = self._create_user("reporter_case")
        officer = self._create_user("officer_case", roles=["Police Officer"])
        detective = self._create_user("detective_case", roles=["Detective"])
        suspect = self._create_user("suspect_case")
        case_obj, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)
        self._assign_detective(case_obj, detective)

        self.client.force_authenticate(reporter)
        create_resp = self.client.post(
            reverse("reward-report-list-create"),
            {"case": case_obj.id, "suspect_profile": profile.id, "description": "tip"},
            format="json",
        )
        report_id = create_resp.data["id"]

        self.client.force_authenticate(officer)
        self.client.post(
            reverse("reward-officer-review", kwargs={"report_id": report_id}),
            {"action": "forward"},
            format="json",
        )
        self.client.force_authenticate(detective)
        approve_resp = self.client.post(
            reverse("reward-detective-review", kwargs={"report_id": report_id}),
            {"action": "approve"},
            format="json",
        )
        tracking = approve_resp.data["unique_code"]
        self.assertTrue(tracking)

        self.client.force_authenticate(officer)
        verify_resp = self.client.get(
            reverse("reward-verify"),
            {"national_id": reporter.national_id, "tracking_code": tracking.lower()},
        )
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(verify_resp.data["tracking_code"], tracking)

    def test_unique_code_is_empty_before_approval(self):
        reporter = self._create_user("reporter_pending")
        officer = self._create_user("officer_pending", roles=["Police Officer"])
        detective = self._create_user("detective_pending", roles=["Detective"])
        suspect = self._create_user("suspect_pending")
        case_obj, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2)
        self._assign_detective(case_obj, detective)

        self.client.force_authenticate(reporter)
        r1 = self.client.post(
            reverse("reward-report-list-create"),
            {"case": case_obj.id, "suspect_profile": profile.id, "description": "pending 1"},
            format="json",
        )
        r2 = self.client.post(
            reverse("reward-report-list-create"),
            {"case": case_obj.id, "suspect_profile": profile.id, "description": "pending 2"},
            format="json",
        )
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED)

        report1 = RewardReport.objects.get(id=r1.data["id"])
        report2 = RewardReport.objects.get(id=r2.data["id"])
        self.assertIsNone(report1.unique_code)
        self.assertIsNone(report2.unique_code)
