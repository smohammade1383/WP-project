from django.contrib.auth import get_user_model
from rest_framework import serializers

from cases.models import Case, SuspectCaseProfile

from .models import CitizenTip

User = get_user_model()


class PublicPersonSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "national_id", "full_name")

    def get_full_name(self, obj):
        full_name = obj.get_full_name()
        return full_name if full_name.strip() else obj.username


class WantedPersonSerializer(serializers.ModelSerializer):
    suspect = PublicPersonSerializer(read_only=True)
    ranking_score = serializers.IntegerField(read_only=True)
    reward_amount = serializers.IntegerField(read_only=True)
    wanted_days = serializers.IntegerField(read_only=True)
    case_severity = serializers.IntegerField(source="case.severity", read_only=True)
    case_id = serializers.IntegerField(source="case.id", read_only=True)

    class Meta:
        model = SuspectCaseProfile
        fields = (
            "id",
            "case_id",
            "case_severity",
            "suspect",
            "wanted_since",
            "wanted_days",
            "severe_tracking",
            "public_photo",
            "public_details",
            "ranking_score",
            "reward_amount",
        )


class AggregatedStatsSerializer(serializers.Serializer):
    total_cases = serializers.IntegerField()
    active_cases = serializers.IntegerField()
    solved_cases = serializers.IntegerField()
    staff_count = serializers.IntegerField()
    wanted_count = serializers.IntegerField()


class CitizenTipSerializer(serializers.ModelSerializer):
    reporter = PublicPersonSerializer(read_only=True)
    officer_reviewer = PublicPersonSerializer(read_only=True)
    detective_reviewer = PublicPersonSerializer(read_only=True)
    tracking_code = serializers.CharField(source="unique_tracking_code", read_only=True)
    suspect_profile_case_id = serializers.IntegerField(source="suspect_profile.case_id", read_only=True)

    class Meta:
        model = CitizenTip
        fields = (
            "id",
            "reporter",
            "case",
            "suspect_profile",
            "suspect_profile_case_id",
            "description",
            "status",
            "officer_reviewer",
            "detective_reviewer",
            "linked_evidence",
            "unique_tracking_code",
            "tracking_code",
            "reward_amount",
            "useful_at",
            "created_at",
        )
        read_only_fields = (
            "id",
            "reporter",
            "status",
            "officer_reviewer",
            "detective_reviewer",
            "linked_evidence",
            "unique_tracking_code",
            "tracking_code",
            "reward_amount",
            "useful_at",
            "created_at",
        )

    def validate(self, attrs):
        suspect_profile = attrs.get("suspect_profile")
        case_obj = attrs.get("case")
        if self.instance is None and suspect_profile is None:
            raise serializers.ValidationError({"suspect_profile": "Submitting a tip requires selecting a suspect profile."})
        if case_obj and suspect_profile and case_obj.id != suspect_profile.case_id:
            raise serializers.ValidationError({"case": "If provided, case must match the suspect profile case."})
        return attrs


class CitizenTipOfficerReviewSerializer(serializers.Serializer):
    approved = serializers.BooleanField()


class CitizenTipDetectiveReviewSerializer(serializers.Serializer):
    approved = serializers.BooleanField()


class CitizenTipLinkCaseSerializer(serializers.Serializer):
    case_id = serializers.PrimaryKeyRelatedField(queryset=Case.objects.all(), source="case")
