from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    BoardItem,
    BoardLink,
    CaptainDecision,
    Case,
    Complaint,
    ComplaintReview,
    DetectiveBoard,
    InterrogationScore,
    SuspectCaseProfile,
)

User = get_user_model()


class UserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "national_id")


class CaseSerializer(serializers.ModelSerializer):
    complainants = UserBriefSerializer(many=True, read_only=True)
    witnesses = UserBriefSerializer(many=True, read_only=True)
    suspects = UserBriefSerializer(many=True, read_only=True)
    created_by = UserBriefSerializer(read_only=True)
    approved_by = UserBriefSerializer(read_only=True)
    complainant_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )
    witness_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )
    suspect_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Case
        fields = (
            "id",
            "title",
            "description",
            "location",
            "incident_datetime",
            "source_type",
            "status",
            "severity",
            "created_by",
            "approved_by",
            "complainants",
            "witnesses",
            "suspects",
            "complainant_ids",
            "witness_ids",
            "suspect_ids",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("status", "created_by", "approved_by", "created_at", "updated_at")

    def create(self, validated_data):
        creator = validated_data.pop("created_by", self.context["request"].user)
        complainants = validated_data.pop("complainant_ids", [])
        witnesses = validated_data.pop("witness_ids", [])
        suspects = validated_data.pop("suspect_ids", [])
        case = Case.objects.create(created_by=creator, **validated_data)
        if complainants:
            case.complainants.set(complainants)
        if witnesses:
            case.witnesses.set(witnesses)
        if suspects:
            case.suspects.set(suspects)
        return case

    def update(self, instance, validated_data):
        complainants = validated_data.pop("complainant_ids", None)
        witnesses = validated_data.pop("witness_ids", None)
        suspects = validated_data.pop("suspect_ids", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if complainants is not None:
            instance.complainants.set(complainants)
        if witnesses is not None:
            instance.witnesses.set(witnesses)
        if suspects is not None:
            instance.suspects.set(suspects)
        return instance


class ComplaintSerializer(serializers.ModelSerializer):
    submitter = UserBriefSerializer(read_only=True)
    complainants = UserBriefSerializer(many=True, read_only=True)
    complainant_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Complaint
        fields = (
            "id",
            "case",
            "submitter",
            "title",
            "description",
            "location",
            "incident_datetime",
            "status",
            "invalid_attempt_count",
            "complainants",
            "complainant_ids",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "case",
            "submitter",
            "status",
            "invalid_attempt_count",
            "created_at",
            "updated_at",
        )

    def create(self, validated_data):
        complainants = validated_data.pop("complainant_ids", [])
        complaint = Complaint.objects.create(submitter=self.context["request"].user, **validated_data)
        initial_complainants = {self.context["request"].user}
        initial_complainants.update(complainants)
        complaint.complainants.set(initial_complainants)
        return complaint


class ComplaintReviewSerializer(serializers.ModelSerializer):
    reviewer = UserBriefSerializer(read_only=True)

    class Meta:
        model = ComplaintReview
        fields = ("id", "complaint", "reviewer", "step", "decision", "message", "created_at")
        read_only_fields = ("id", "complaint", "reviewer", "step", "created_at")


class ComplaintDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=ComplaintReview.Decision.choices)
    message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["decision"] == ComplaintReview.Decision.RETURNED and not attrs.get("message", "").strip():
            raise serializers.ValidationError({"message": "Returned decision must include a message."})
        return attrs


class AddComplainantsSerializer(serializers.Serializer):
    complainant_ids = serializers.PrimaryKeyRelatedField(many=True, queryset=User.objects.all())


class CrimeSceneCaseCreateSerializer(serializers.ModelSerializer):
    witness_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        required=False,
    )

    class Meta:
        model = Case
        fields = (
            "id",
            "title",
            "description",
            "location",
            "incident_datetime",
            "severity",
            "witness_ids",
        )


class BoardItemSerializer(serializers.ModelSerializer):
    evidence_title = serializers.CharField(source="evidence.title", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = BoardItem
        fields = (
            "id",
            "board",
            "item_type",
            "note_text",
            "evidence",
            "evidence_title",
            "user",
            "username",
            "position_x",
            "position_y",
            "width",
            "height",
        )
        read_only_fields = ("board",)

    def validate(self, attrs):
        item_type = attrs.get("item_type", getattr(self.instance, "item_type", None))
        note_text = attrs.get("note_text", getattr(self.instance, "note_text", ""))
        evidence = attrs.get("evidence", getattr(self.instance, "evidence", None))
        user = attrs.get("user", getattr(self.instance, "user", None))

        if item_type == BoardItem.ItemType.NOTE and not (note_text or "").strip():
            raise serializers.ValidationError({"note_text": "This field is required for note items."})
        if item_type == BoardItem.ItemType.EVIDENCE and not evidence:
            raise serializers.ValidationError({"evidence": "This field is required for evidence items."})
        if item_type in {BoardItem.ItemType.WITNESS, BoardItem.ItemType.SUSPECT} and not user:
            raise serializers.ValidationError({"user": "This field is required for witness/suspect items."})
        return attrs


class BoardLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardLink
        fields = ("id", "board", "from_item", "to_item", "description")
        read_only_fields = ("board",)

    def validate(self, attrs):
        from_item = attrs.get("from_item", getattr(self.instance, "from_item", None))
        to_item = attrs.get("to_item", getattr(self.instance, "to_item", None))
        board = attrs.get("board", self.context.get("board", getattr(self.instance, "board", None)))

        if from_item and to_item and from_item.id == to_item.id:
            raise serializers.ValidationError("from_item and to_item cannot be the same.")
        if board and from_item and from_item.board_id != board.id:
            raise serializers.ValidationError("from_item must belong to the same board.")
        if board and to_item and to_item.board_id != board.id:
            raise serializers.ValidationError("to_item must belong to the same board.")
        return attrs


class DetectiveBoardSerializer(serializers.ModelSerializer):
    items = BoardItemSerializer(many=True, read_only=True)
    links = BoardLinkSerializer(many=True, read_only=True)

    class Meta:
        model = DetectiveBoard
        fields = ("id", "case", "detective", "created_at", "items", "links")


class SuspectCaseProfileSerializer(serializers.ModelSerializer):
    suspect = UserBriefSerializer(read_only=True)
    ranking_score = serializers.IntegerField(read_only=True)
    reward_amount = serializers.IntegerField(read_only=True)
    wanted_days = serializers.IntegerField(read_only=True)

    class Meta:
        model = SuspectCaseProfile
        fields = (
            "id",
            "case",
            "suspect",
            "wanted_since",
            "wanted_days",
            "arrest_warrant_issued",
            "is_arrested",
            "severe_tracking",
            "public_photo",
            "public_details",
            "ranking_score",
            "reward_amount",
        )


class SuspectNominationSerializer(serializers.Serializer):
    suspect_ids = serializers.PrimaryKeyRelatedField(many=True, queryset=User.objects.all())
    summary = serializers.CharField(required=False, allow_blank=True)


class SergeantDecisionSerializer(serializers.Serializer):
    approved = serializers.BooleanField()
    message = serializers.CharField(required=False, allow_blank=True)


class WantedUpdateSerializer(serializers.Serializer):
    public_photo = serializers.URLField(required=False, allow_blank=True)
    public_details = serializers.CharField(required=False, allow_blank=True)


class InterrogationScoreSerializer(serializers.ModelSerializer):
    scorer = UserBriefSerializer(read_only=True)

    class Meta:
        model = InterrogationScore
        fields = ("id", "suspect_profile", "scorer", "scorer_role", "score", "notes", "created_at")
        read_only_fields = ("id", "suspect_profile", "scorer", "created_at")


class CaptainDecisionSerializer(serializers.ModelSerializer):
    captain = UserBriefSerializer(read_only=True)
    chief = UserBriefSerializer(read_only=True)

    class Meta:
        model = CaptainDecision
        fields = (
            "id",
            "suspect_profile",
            "captain",
            "chief",
            "is_confirmed",
            "chief_confirmed",
            "summary",
            "created_at",
        )
        read_only_fields = ("id", "suspect_profile", "captain", "chief", "created_at")


class CaptainDecisionCreateSerializer(serializers.Serializer):
    is_confirmed = serializers.BooleanField()
    summary = serializers.CharField(required=False, allow_blank=True)


class ChiefDecisionSerializer(serializers.Serializer):
    chief_confirmed = serializers.BooleanField()
    summary = serializers.CharField(required=False, allow_blank=True)


class BreakdownStatsSerializer(serializers.Serializer):
    by_severity = serializers.DictField(child=serializers.IntegerField())
    by_status = serializers.DictField(child=serializers.IntegerField())
