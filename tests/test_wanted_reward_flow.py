from datetime import timedelta

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, SuspectCaseProfile
from evidence.models import Evidence
from finance.models import RewardReport
from people.models import CitizenTip
from users.models import User


class WantedRewardFlowTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self._seq = 50000

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

    def _create_case_and_profile(self, creator, suspect, severity, wanted_days=0):
        case_obj = Case.objects.create(
            title=f"Wanted flow case {severity}",
            description="Wanted flow fixture",
            location="Test zone",
            incident_datetime=timezone.now(),
            source_type=Case.SourceType.CRIME_SCENE,
            status=Case.Status.OPEN,
            severity=severity,
            created_by=creator,
        )
        profile = SuspectCaseProfile.objects.create(case=case_obj, suspect=suspect)
        if wanted_days > 0:
            SuspectCaseProfile.objects.filter(id=profile.id).update(
                wanted_since=timezone.now() - timedelta(days=wanted_days)
            )
            profile.refresh_from_db()
        return case_obj, profile

    def test_public_wanted_lists_active_profiles_and_prioritizes_severe_tracking(self):
        officer = self._create_user("wanted_officer", roles=["Police Officer"])
        suspect_a = self._create_user("wanted_suspect_a", roles=["Suspect"])
        suspect_b = self._create_user("wanted_suspect_b", roles=["Suspect"])
        suspect_c = self._create_user("wanted_suspect_c", roles=["Suspect"])
        suspect_d = self._create_user("wanted_suspect_d", roles=["Suspect"])

        # Ranking: max(days_wanted) * max(crime_level)
        # A = 45 * 4 = 180
        _, profile_a = self._create_case_and_profile(
            officer, suspect_a, Case.Severity.CRITICAL, wanted_days=45
        )
        # B = 31 * 3 = 93
        _, profile_b = self._create_case_and_profile(
            officer, suspect_b, Case.Severity.LEVEL_1, wanted_days=31
        )
        # C is wanted but not severe (< 30 days) and should still be visible.
        _, profile_c = self._create_case_and_profile(
            officer, suspect_c, Case.Severity.LEVEL_2, wanted_days=10
        )
        # D has no warrant yet and must stay hidden.
        _, profile_d = self._create_case_and_profile(
            officer, suspect_d, Case.Severity.LEVEL_3, wanted_days=60
        )

        profile_a.arrest_warrant_issued = True
        profile_a.save(update_fields=["arrest_warrant_issued"])
        profile_b.arrest_warrant_issued = True
        profile_b.save(update_fields=["arrest_warrant_issued"])
        profile_c.arrest_warrant_issued = True
        profile_c.save(update_fields=["arrest_warrant_issued"])

        resp = self.client.get(reverse("people-wanted-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        returned_ids = [row["id"] for row in resp.data]
        self.assertIn(profile_a.id, returned_ids)
        self.assertIn(profile_b.id, returned_ids)
        self.assertIn(profile_c.id, returned_ids)
        self.assertNotIn(profile_d.id, returned_ids)

        # Severe profiles are prioritized, then ranking desc.
        self.assertEqual(resp.data[0]["id"], profile_a.id)
        self.assertEqual(resp.data[0]["ranking_score"], 180)
        self.assertEqual(resp.data[0]["reward_amount"], 180 * 20_000_000)
        self.assertEqual(resp.data[1]["id"], profile_b.id)
        self.assertEqual(resp.data[1]["ranking_score"], 93)
        self.assertEqual(resp.data[2]["id"], profile_c.id)
        self.assertFalse(resp.data[2]["severe_tracking"])

    def test_public_wanted_detail_includes_non_severe_when_warrant_is_issued(self):
        officer = self._create_user("wanted_detail_officer", roles=["Police Officer"])
        suspect = self._create_user("wanted_detail_suspect", roles=["Suspect"])
        _, profile = self._create_case_and_profile(
            officer, suspect, Case.Severity.LEVEL_2, wanted_days=5
        )
        profile.arrest_warrant_issued = True
        profile.save(update_fields=["arrest_warrant_issued"])

        resp = self.client.get(reverse("people-wanted-detail", kwargs={"suspect_id": suspect.id}))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], profile.id)
        self.assertFalse(resp.data["severe_tracking"])

    def test_wanted_day_count_starts_from_one_for_new_profile(self):
        officer = self._create_user("wanted_day_officer", roles=["Police Officer"])
        suspect = self._create_user("wanted_day_suspect", roles=["Suspect"])
        _, profile = self._create_case_and_profile(
            officer, suspect, Case.Severity.LEVEL_2, wanted_days=0
        )
        profile.arrest_warrant_issued = True
        profile.save(update_fields=["arrest_warrant_issued"])

        self.assertEqual(profile.wanted_days, 1)
        self.assertEqual(profile.ranking_score, 2)  # 1 day * level-2
        self.assertEqual(profile.reward_amount, 40_000_000)

    def test_reward_flow_forward_then_detective_approve_creates_evidence_and_tracking_code(self):
        citizen = self._create_user("reward_citizen", roles=["Basic User"])
        officer = self._create_user("reward_officer", roles=["Police Officer"])
        detective = self._create_user("reward_detective", roles=["Detective"])
        suspect = self._create_user("reward_suspect", roles=["Suspect"])

        case_obj, profile = self._create_case_and_profile(
            officer, suspect, Case.Severity.LEVEL_2, wanted_days=35
        )

        self.client.force_authenticate(citizen)
        create_resp = self.client.post(
            reverse("reward-report-list-create"),
            {
                "case": case_obj.id,
                "suspect_profile": profile.id,
                "description": "Citizen tip: suspect was seen near warehouse.",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        report_id = create_resp.data["id"]
        self.assertEqual(create_resp.data["status"], RewardReport.Status.OFFICER_REVIEW)

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
        self.assertEqual(approve_resp.data["tracking_code"], approve_resp.data["unique_code"])
        self.assertEqual(approve_resp.data["reward_amount"], profile.reward_amount)

        evidence_exists = Evidence.objects.filter(
            case=case_obj,
            created_by=detective,
            type=Evidence.Type.OTHER,
            title__startswith="Informant Report",
            description__icontains="warehouse",
        ).exists()
        self.assertTrue(evidence_exists)

    def test_reward_officer_reject_marks_final_and_blocks_detective_approval(self):
        citizen = self._create_user("reject_citizen", roles=["Basic User"])
        officer = self._create_user("reject_officer", roles=["Police Officer"])
        detective = self._create_user("reject_detective", roles=["Detective"])
        suspect = self._create_user("reject_suspect", roles=["Suspect"])

        case_obj, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2, wanted_days=32)

        self.client.force_authenticate(citizen)
        create_resp = self.client.post(
            reverse("reward-report-list-create"),
            {
                "case": case_obj.id,
                "suspect_profile": profile.id,
                "description": "Likely spam report",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        report_id = create_resp.data["id"]

        self.client.force_authenticate(officer)
        reject_resp = self.client.post(
            reverse("reward-officer-review", kwargs={"report_id": report_id}),
            {"action": "reject"},
            format="json",
        )
        self.assertEqual(reject_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(reject_resp.data["status"], RewardReport.Status.REJECTED)

        self.client.force_authenticate(detective)
        blocked = self.client.post(
            reverse("reward-detective-review", kwargs={"report_id": report_id}),
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reward_verify_accepts_tracking_code_for_police_only(self):
        citizen = self._create_user("verify_citizen", roles=["Basic User"])
        officer = self._create_user("verify_officer", roles=["Police Officer"])
        detective = self._create_user("verify_detective", roles=["Detective"])
        suspect = self._create_user("verify_suspect", roles=["Suspect"])

        case_obj, profile = self._create_case_and_profile(officer, suspect, Case.Severity.LEVEL_2, wanted_days=33)

        self.client.force_authenticate(citizen)
        create_resp = self.client.post(
            reverse("reward-report-list-create"),
            {
                "case": case_obj.id,
                "suspect_profile": profile.id,
                "description": "Good lead for verification",
            },
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
        approved = self.client.post(
            reverse("reward-detective-review", kwargs={"report_id": report_id}),
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(approved.status_code, status.HTTP_200_OK)
        tracking_code = approved.data["tracking_code"]

        self.client.force_authenticate(citizen)
        denied = self.client.get(
            reverse("reward-verify"),
            {"national_id": citizen.national_id, "tracking_code": tracking_code},
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(officer)
        ok = self.client.get(
            reverse("reward-verify"),
            {"national_id": citizen.national_id, "tracking_code": tracking_code},
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertEqual(ok.data["tracking_code"], tracking_code)
        self.assertEqual(ok.data["reporter"]["national_id"], citizen.national_id)

    def test_citizen_tip_rejections_become_final_rejected_status(self):
        citizen = self._create_user("tips_citizen", roles=["Basic User"])
        officer = self._create_user("tips_officer", roles=["Police Officer"])
        detective = self._create_user("tips_detective", roles=["Detective"])
        suspect = self._create_user("tips_suspect", roles=["Suspect"])
        case_obj, profile = self._create_case_and_profile(
            officer, suspect, Case.Severity.LEVEL_2, wanted_days=34
        )

        self.client.force_authenticate(citizen)
        tip_resp = self.client.post(
            reverse("people-tips"),
            {
                "case": case_obj.id,
                "suspect_profile": profile.id,
                "description": "Unrelated spam tip",
            },
            format="json",
        )
        self.assertEqual(tip_resp.status_code, status.HTTP_201_CREATED)
        tip_id = tip_resp.data["id"]

        self.client.force_authenticate(officer)
        officer_reject = self.client.post(
            reverse("people-tips-officer-review", kwargs={"tip_id": tip_id}),
            {"approved": False},
            format="json",
        )
        self.assertEqual(officer_reject.status_code, status.HTTP_200_OK)
        self.assertEqual(officer_reject.data["status"], CitizenTip.Status.REJECTED)

        self.client.force_authenticate(citizen)
        second_tip = self.client.post(
            reverse("people-tips"),
            {
                "case": case_obj.id,
                "suspect_profile": profile.id,
                "description": "Needs detective but later rejected",
            },
            format="json",
        )
        tip2_id = second_tip.data["id"]

        self.client.force_authenticate(officer)
        self.client.post(
            reverse("people-tips-officer-review", kwargs={"tip_id": tip2_id}),
            {"approved": True},
            format="json",
        )

        self.client.force_authenticate(detective)
        detective_reject = self.client.post(
            reverse("people-tips-detective-review", kwargs={"tip_id": tip2_id}),
            {"approved": False},
            format="json",
        )
        self.assertEqual(detective_reject.status_code, status.HTTP_200_OK)
        self.assertEqual(detective_reject.data["status"], CitizenTip.Status.REJECTED)
