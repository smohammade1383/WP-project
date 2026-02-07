from django.contrib.auth import get_user_model
from rest_framework import serializers

from cases.models import SuspectCaseProfile

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
