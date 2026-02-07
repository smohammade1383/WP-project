from django.contrib.auth import authenticate
from django.contrib.auth.models import Group, Permission
from django.db import IntegrityError
from rest_framework import serializers

from .constants import DEFAULT_SIGNUP_ROLE
from .models import User


class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = (
            "username",
            "password",
            "email",
            "phone_number",
            "national_id",
            "first_name",
            "last_name",
        )

    def create(self, validated_data):
        password = validated_data.pop("password")
        try:
            user = User.objects.create_user(password=password, **validated_data)
        except IntegrityError:
            raise serializers.ValidationError(
                {"detail": "A user with one of the unique fields already exists."}
            )

        default_group, _ = Group.objects.get_or_create(name=DEFAULT_SIGNUP_ROLE)
        user.groups.add(default_group)
        return user


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        request = self.context.get("request")
        user = authenticate(
            request=request,
            username=attrs["identifier"],
            password=attrs["password"],
        )
        if not user:
            raise serializers.ValidationError({"detail": "Invalid credentials."})
        attrs["user"] = user
        return attrs


class ProfileSerializer(serializers.ModelSerializer):
    role_names = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "phone_number",
            "national_id",
            "first_name",
            "last_name",
            "role_names",
        )
        read_only_fields = ("id", "username", "national_id", "role_names")


class RoleSerializer(serializers.ModelSerializer):
    description = serializers.CharField(source="profile.description", allow_blank=True, required=False)
    permissions = serializers.SlugRelatedField(
        many=True,
        slug_field="codename",
        queryset=Permission.objects.all(),
        required=False,
    )

    class Meta:
        model = Group
        fields = ("id", "name", "description", "permissions")

    def create(self, validated_data):
        profile_data = validated_data.pop("profile", {})
        permissions = validated_data.pop("permissions", [])
        group = Group.objects.create(**validated_data)
        group.permissions.set(permissions)
        profile = getattr(group, "profile", None)
        if profile is not None:
            profile.description = profile_data.get("description", "")
            profile.save(update_fields=["description"])
        return group

    def update(self, instance, validated_data):
        profile_data = validated_data.pop("profile", {})
        permissions = validated_data.pop("permissions", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if permissions is not None:
            instance.permissions.set(permissions)
        if profile_data:
            profile = getattr(instance, "profile", None)
            if profile is not None:
                profile.description = profile_data.get("description", "")
                profile.save(update_fields=["description"])
        return instance


class UserRoleUpdateSerializer(serializers.Serializer):
    role_names = serializers.ListField(child=serializers.CharField(), allow_empty=False)

    def validate_role_names(self, value):
        existing = set(Group.objects.filter(name__in=value).values_list("name", flat=True))
        missing = sorted(set(value) - existing)
        if missing:
            raise serializers.ValidationError(f"Unknown roles: {', '.join(missing)}")
        return value
