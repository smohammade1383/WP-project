from django.contrib.auth import get_user_model
from rest_framework import serializers

from cases.models import SuspectCaseProfile
from .models import PaymentTransaction, RewardReport

User = get_user_model()


class FinanceUserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "national_id")


class RewardReportSerializer(serializers.ModelSerializer):
    reporter = FinanceUserBriefSerializer(read_only=True)
    tracking_code = serializers.CharField(source="unique_code", read_only=True)

    class Meta:
        model = RewardReport
        fields = (
            "id",
            "reporter",
            "case",
            "suspect_profile",
            "description",
            "status",
            "reviewed_by_officer",
            "reviewed_by_detective",
            "unique_code",
            "tracking_code",
            "reward_amount",
            "created_at",
        )
        read_only_fields = (
            "id",
            "reporter",
            "status",
            "reviewed_by_officer",
            "reviewed_by_detective",
            "unique_code",
            "tracking_code",
            "reward_amount",
            "created_at",
        )

    def validate(self, attrs):
        case_obj = attrs.get("case")
        suspect_profile = attrs.get("suspect_profile")

        if not case_obj and not suspect_profile:
            raise serializers.ValidationError(
                {"detail": "Either case or suspect_profile must be provided."}
            )

        if suspect_profile and not case_obj:
            attrs["case"] = suspect_profile.case
            return attrs

        if suspect_profile and case_obj and suspect_profile.case_id != case_obj.id:
            raise serializers.ValidationError(
                {"suspect_profile": "suspect_profile must belong to the provided case."}
            )

        return attrs


class RewardOfficerReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[("forward", "forward"), ("reject", "reject")])


class RewardDetectiveReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[("approve", "approve"), ("reject", "reject")])


class RewardVerificationSerializer(serializers.Serializer):
    national_id = serializers.CharField(max_length=10)
    unique_code = serializers.CharField(max_length=24, required=False, allow_blank=True)
    tracking_code = serializers.CharField(max_length=24, required=False, allow_blank=True)

    def validate(self, attrs):
        unique_code = (attrs.get("unique_code") or "").strip()
        tracking_code = (attrs.get("tracking_code") or "").strip()
        if not unique_code and not tracking_code:
            raise serializers.ValidationError(
                {"detail": "Either unique_code or tracking_code must be provided."}
            )
        attrs["resolved_code"] = unique_code or tracking_code
        return attrs


class PaymentTransactionSerializer(serializers.ModelSerializer):
    case_status = serializers.CharField(source="case.status", read_only=True)
    suspect_is_arrested = serializers.BooleanField(source="suspect_profile.is_arrested", read_only=True)
    suspect_is_bail_allowed = serializers.BooleanField(source="suspect_profile.is_bail_allowed", read_only=True)
    suspect_bail_amount = serializers.IntegerField(source="suspect_profile.bail_amount", read_only=True)

    class Meta:
        model = PaymentTransaction
        fields = (
            "id",
            "payer",
            "case",
            "suspect_profile",
            "amount",
            "transaction_type",
            "status",
            "case_status",
            "suspect_is_arrested",
            "suspect_is_bail_allowed",
            "suspect_bail_amount",
            "gateway_reference",
            "callback_payload",
            "return_url",
            "created_at",
            "paid_at",
        )
        read_only_fields = (
            "id",
            "status",
            "gateway_reference",
            "callback_payload",
            "created_at",
            "paid_at",
        )


class PaymentInitiateSerializer(serializers.Serializer):
    suspect_profile = serializers.PrimaryKeyRelatedField(queryset=PaymentTransaction._meta.get_field("suspect_profile").related_model.objects.all())
    amount = serializers.IntegerField(min_value=1, max_value=2_000_000_000)
    transaction_type = serializers.ChoiceField(choices=PaymentTransaction.TransactionType.choices)
    return_url = serializers.URLField(required=False, allow_blank=True)
    sergeant_approved = serializers.BooleanField(required=False, default=False)


class BailRequestSerializer(serializers.Serializer):
    transaction_id = serializers.IntegerField(required=False, min_value=1)
    suspect_profile = serializers.PrimaryKeyRelatedField(
        queryset=SuspectCaseProfile.objects.select_related("case", "suspect").all(),
        required=False,
    )
    amount = serializers.IntegerField(min_value=1, max_value=2_000_000_000, required=False)
    description = serializers.CharField(required=False, allow_blank=True, max_length=255)
    return_url = serializers.URLField(required=False, allow_blank=True)
    sergeant_approved = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        tx_id = attrs.get("transaction_id")
        suspect_profile = attrs.get("suspect_profile")
        amount = attrs.get("amount")

        if tx_id:
            return attrs

        if not suspect_profile or amount is None:
            raise serializers.ValidationError(
                {
                    "detail": "Provide either transaction_id, or suspect_profile + amount."
                }
            )
        return attrs


class PaymentCallbackSerializer(serializers.Serializer):
    transaction_id = serializers.IntegerField(required=False)
    gateway_reference = serializers.CharField(max_length=100, required=False)
    status = serializers.CharField()
    payload = serializers.JSONField(required=False)

    def validate(self, attrs):
        transaction_id = attrs.get("transaction_id")
        gateway_reference = attrs.get("gateway_reference")
        if not transaction_id and not gateway_reference:
            raise serializers.ValidationError(
                {"detail": "Either transaction_id or gateway_reference is required."}
            )

        raw_status = str(attrs["status"]).strip().lower()
        paid_codes = {"1", "paid", "ok", "success", "true"}
        failed_codes = {"0", "failed", "fail", "nok", "false"}

        if raw_status in paid_codes:
            attrs["normalized_status"] = "paid"
        elif raw_status in failed_codes:
            attrs["normalized_status"] = "failed"
        else:
            raise serializers.ValidationError(
                {"status": "Unsupported callback status code."}
            )
        return attrs
