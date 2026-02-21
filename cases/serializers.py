from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    BoardItem,
    BoardLink,
    BoardConnection,
    CaptainDecision,
    Case,
    CrimeSceneWitness,
    Complaint,
    ComplaintReview,
    DetectiveBoard,
    InterrogationScore,
    SecondaryComplainant,
    SuspectCaseProfile,
)

User = get_user_model()


class UserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "national_id")


class CrimeSceneWitnessSerializer(serializers.ModelSerializer):
    class Meta:
        model = CrimeSceneWitness
        fields = ("id", "full_name", "national_id", "phone_number")
        read_only_fields = ("id",)


class CaseSerializer(serializers.ModelSerializer):
    complainants = UserBriefSerializer(many=True, read_only=True)
    witnesses = UserBriefSerializer(many=True, read_only=True)
    suspects = UserBriefSerializer(many=True, read_only=True)
    local_witnesses = CrimeSceneWitnessSerializer(many=True, read_only=True)
    created_by = UserBriefSerializer(read_only=True)
    approved_by = UserBriefSerializer(read_only=True)
    assigned_detective = UserBriefSerializer(read_only=True)
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
            "assigned_detective",
            "complainants",
            "witnesses",
            "suspects",
            "local_witnesses",
            "complainant_ids",
            "witness_ids",
            "suspect_ids",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "created_by",
            "approved_by",
            "assigned_detective",
            "created_at",
            "updated_at",
        )

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
    secondary_complainants = serializers.SerializerMethodField(read_only=True)
    latest_review_decision = serializers.SerializerMethodField(read_only=True)
    latest_review_step = serializers.SerializerMethodField(read_only=True)
    latest_review_message = serializers.SerializerMethodField(read_only=True)
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
            "latest_review_decision",
            "latest_review_step",
            "latest_review_message",
            "complainants",
            "secondary_complainants",
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

    def _latest_review(self, obj):
        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("reviews")
        if prefetched is not None:
            if not prefetched:
                return None
            return max(prefetched, key=lambda review: review.created_at)
        return obj.reviews.order_by("-created_at").first()

    def get_latest_review_decision(self, obj):
        review = self._latest_review(obj)
        return review.decision if review else None

    def get_secondary_complainants(self, obj):
        entries = obj.secondary_complainants.select_related("user", "requested_by", "reviewed_by")
        return SecondaryComplainantSerializer(entries, many=True).data

    def get_latest_review_step(self, obj):
        review = self._latest_review(obj)
        return review.step if review else None

    def get_latest_review_message(self, obj):
        review = self._latest_review(obj)
        return review.message if review and review.message else ""


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


class SecondaryComplainantSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)
    requested_by = UserBriefSerializer(read_only=True)
    reviewed_by = UserBriefSerializer(read_only=True)

    class Meta:
        model = SecondaryComplainant
        fields = (
            "id",
            "user",
            "status",
            "requested_by",
            "reviewed_by",
            "review_message",
            "created_at",
            "updated_at",
        )


class SecondaryComplainantRequestSerializer(serializers.Serializer):
    complainant_ids = serializers.PrimaryKeyRelatedField(many=True, queryset=User.objects.all())


class SecondaryComplainantReviewSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=[("approved", "approved"), ("rejected", "rejected")])
    message = serializers.CharField(required=False, allow_blank=True)


class CrimeSceneWitnessInputSerializer(serializers.Serializer):
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    national_id = serializers.CharField(max_length=10)
    phone_number = serializers.CharField(max_length=20)


class CrimeSceneCaseCreateSerializer(serializers.ModelSerializer):
    witness_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        required=False,
    )
    local_witnesses = CrimeSceneWitnessInputSerializer(many=True, required=False)

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
            "local_witnesses",
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
    connections = serializers.SerializerMethodField()

    class Meta:
        model = DetectiveBoard
        fields = ("id", "case", "detective", "created_at", "items", "links", "connections")

    def get_connections(self, obj):
        return BoardConnectionSerializer(obj.connections.all(), many=True).data


class BoardConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardConnection
        fields = ("id", "board", "from_evidence", "to_evidence", "description", "created_at")
        read_only_fields = ("id", "board", "created_at")

    def validate(self, attrs):
        board = attrs.get("board", self.context.get("board", getattr(self.instance, "board", None)))
        from_evidence = attrs.get("from_evidence", getattr(self.instance, "from_evidence", None))
        to_evidence = attrs.get("to_evidence", getattr(self.instance, "to_evidence", None))

        if from_evidence and to_evidence and from_evidence.id == to_evidence.id:
            raise serializers.ValidationError("from_evidence and to_evidence cannot be the same.")
        if board and from_evidence and from_evidence.case_id != board.case_id:
            raise serializers.ValidationError("from_evidence must belong to the same case as the board.")
        if board and to_evidence and to_evidence.case_id != board.case_id:
            raise serializers.ValidationError("to_evidence must belong to the same case as the board.")
        return attrs


class SuspectCaseProfileSerializer(serializers.ModelSerializer):
    suspect = UserBriefSerializer(read_only=True)
    ranking_score = serializers.IntegerField(read_only=True)
    reward_amount = serializers.IntegerField(read_only=True)
    wanted_days = serializers.IntegerField(read_only=True)
    scores = serializers.SerializerMethodField(read_only=True)

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
            "is_bail_allowed",
            "bail_amount",
            "severe_tracking",
            "public_photo",
            "public_details",
            "ranking_score",
            "reward_amount",
            "scores",
        )

    def get_scores(self, obj):
        return [
            {
                "id": score.id,
                "scorer_role": score.scorer_role,
                "score": score.score,
                "notes": score.notes,
                "created_at": score.created_at,
                "scorer": {
                    "id": score.scorer_id,
                    "username": score.scorer.username,
                    "first_name": score.scorer.first_name,
                    "last_name": score.scorer.last_name,
                },
            }
            for score in obj.scores.select_related("scorer").all()
        ]


class SuspectNominationSerializer(serializers.Serializer):
    suspect_ids = serializers.PrimaryKeyRelatedField(many=True, queryset=User.objects.all())
    summary = serializers.CharField(required=False, allow_blank=True)


class SergeantDecisionSerializer(serializers.Serializer):
    approved = serializers.BooleanField()
    message = serializers.CharField(required=False, allow_blank=True)


class SubmitToCaptainSerializer(serializers.Serializer):
    message = serializers.CharField(required=False, allow_blank=True)


class WantedUpdateSerializer(serializers.Serializer):
    public_photo = serializers.URLField(required=False, allow_blank=True)
    public_details = serializers.CharField(required=False, allow_blank=True)


class SuspectBailPolicySerializer(serializers.Serializer):
    is_bail_allowed = serializers.BooleanField()
    bail_amount = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    def validate(self, attrs):
        is_bail_allowed = attrs["is_bail_allowed"]
        bail_amount = attrs.get("bail_amount")
        if is_bail_allowed and bail_amount is None:
            raise serializers.ValidationError({"bail_amount": "Bail amount is required when bail is allowed."})
        if not is_bail_allowed:
            attrs["bail_amount"] = None
        return attrs


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
