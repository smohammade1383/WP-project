from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import PaymentTransaction, RewardReport

User = get_user_model()


class FinanceUserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "national_id")


class RewardReportSerializer(serializers.ModelSerializer):
    reporter = FinanceUserBriefSerializer(read_only=True)

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
            "reward_amount",
            "created_at",
        )


class RewardOfficerReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[("forward", "forward"), ("reject", "reject")])


class RewardDetectiveReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[("approve", "approve"), ("reject", "reject")])


class RewardVerificationSerializer(serializers.Serializer):
    national_id = serializers.CharField(max_length=10)
    unique_code = serializers.CharField(max_length=24)


class PaymentTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentTransaction
        fields = (
            "id",
            "case",
            "suspect_profile",
            "amount",
            "transaction_type",
            "status",
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
    amount = serializers.IntegerField(min_value=1)
    transaction_type = serializers.ChoiceField(choices=PaymentTransaction.TransactionType.choices)
    return_url = serializers.URLField(required=False, allow_blank=True)
    sergeant_approved = serializers.BooleanField(required=False, default=False)


class PaymentCallbackSerializer(serializers.Serializer):
    gateway_reference = serializers.CharField(max_length=100)
    status = serializers.ChoiceField(choices=[("paid", "paid"), ("failed", "failed")])
    payload = serializers.JSONField(required=False)
