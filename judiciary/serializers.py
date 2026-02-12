from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Punishment, Trial


class TrialSerializer(serializers.ModelSerializer):
    punishment_title = serializers.CharField(write_only=True, required=False, allow_blank=True)
    punishment_description = serializers.CharField(write_only=True, required=False, allow_blank=True)
    punishment = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Trial
        fields = (
            "id",
            "case",
            "defendant",
            "judge",
            "verdict",
            "verdict_note",
            "created_at",
            "punishment_title",
            "punishment_description",
            "punishment",
        )
        read_only_fields = ("id", "judge", "created_at", "punishment")

    def validate(self, attrs):
        verdict = attrs.get("verdict")
        punishment_title = attrs.get("punishment_title")
        punishment_description = attrs.get("punishment_description")
        if verdict == Trial.Verdict.GUILTY and (not punishment_title or not punishment_description):
            raise serializers.ValidationError(
                {"punishment": "Punishment title and description are required when verdict is guilty."}
            )
        return attrs

    def create(self, validated_data):
        punishment_title = validated_data.pop("punishment_title", "")
        punishment_description = validated_data.pop("punishment_description", "")
        trial = Trial.objects.create(**validated_data)
        if trial.verdict == Trial.Verdict.GUILTY:
            Punishment.objects.create(
                trial=trial,
                title=punishment_title,
                description=punishment_description,
            )
        return trial

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_punishment(self, obj):
        if not hasattr(obj, "punishment"):
            return None
        return {
            "title": obj.punishment.title,
            "description": obj.punishment.description,
        }


class InvolvedPersonnelSerializer(serializers.Serializer):
    name = serializers.CharField()
    rank = serializers.CharField()
    role = serializers.CharField()
    action_date = serializers.DateTimeField()


class CaseReportSerializer(serializers.Serializer):
    case = serializers.DictField()
    complaints = serializers.ListField(child=serializers.DictField())
    evidence = serializers.ListField(child=serializers.DictField())
    suspect_profiles = serializers.ListField(child=serializers.DictField())
    trials = serializers.ListField(child=serializers.DictField())
    complainants = serializers.ListField(child=serializers.DictField())
    criminals = serializers.ListField(child=serializers.DictField())
    involved_personnel = InvolvedPersonnelSerializer(many=True)
    pending_chief_decision_ids = serializers.ListField(child=serializers.IntegerField())
    board_snapshot = serializers.DictField(allow_null=True)
