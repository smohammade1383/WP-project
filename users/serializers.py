from django.contrib.auth import authenticate
from django.contrib.auth.models import Group, Permission
from django.db import IntegrityError
from rest_framework import serializers

from .constants import DEFAULT_SIGNUP_ROLE
from .models import User
from .utils import normalize_digits


class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    phone_number = serializers.CharField()
    national_id = serializers.CharField()

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
        validated_data["username"] = validated_data["username"].strip()
        validated_data["email"] = validated_data["email"].strip().lower()
        validated_data["phone_number"] = normalize_digits(validated_data["phone_number"]).strip()
        validated_data["national_id"] = normalize_digits(validated_data["national_id"]).strip()

        password = validated_data.pop("password")
        
        # Check for existing users with better error messages
        errors = {}
        if User.objects.filter(username=validated_data.get('username')).exists():
            errors['username'] = 'این نام کاربری قبلاً استفاده شده است'
        if User.objects.filter(email__iexact=validated_data.get('email')).exists():
            errors['email'] = 'این ایمیل قبلاً ثبت شده است'
        if User.objects.filter(phone_number=validated_data.get('phone_number')).exists():
            errors['phone_number'] = 'این شماره تلفن قبلاً ثبت شده است'
        if User.objects.filter(national_id=validated_data.get('national_id')).exists():
            errors['national_id'] = 'این کد ملی قبلاً ثبت شده است'
        
        if errors:
            raise serializers.ValidationError(errors)
        
        try:
            user = User.objects.create_user(password=password, **validated_data)
        except IntegrityError:
            raise serializers.ValidationError(
                {"detail": "کاربری با این مشخصات قبلاً ثبت‌نام کرده است"}
            )

        default_group, _ = Group.objects.get_or_create(name=DEFAULT_SIGNUP_ROLE)
        user.groups.add(default_group)
        return user

    def validate_phone_number(self, value):
        normalized = normalize_digits(value).strip()
        if not normalized.startswith("09") or len(normalized) != 11 or not normalized.isdigit():
            raise serializers.ValidationError("فرمت شماره تلفن نامعتبر است (مثال: ۰۹۱۲۳۴۵۶۷۸۹)")
        return normalized

    def validate_national_id(self, value):
        normalized = normalize_digits(value).strip()
        if len(normalized) != 10 or not normalized.isdigit():
            raise serializers.ValidationError("کد ملی باید ۱۰ رقم باشد")
        return normalized


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        request = self.context.get("request")
        identifier = normalize_digits(attrs["identifier"]).strip()
        attrs["identifier"] = identifier
        user = authenticate(
            request=request,
            username=identifier,
            password=attrs["password"],
        )
        if not user:
            raise serializers.ValidationError({"detail": "نام کاربری یا رمز عبور نامعتبر است"})
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
            "is_active",
            "is_superuser",
        )
        read_only_fields = (
            "id",
            "username",
            "national_id",
            "role_names",
            "is_active",
            "is_superuser",
        )

    def validate_email(self, value):
        user = self.context['request'].user
        if User.objects.exclude(pk=user.pk).filter(email=value).exists():
            raise serializers.ValidationError("این ایمیل قبلاً استفاده شده است")
        return value

    def validate_phone_number(self, value):
        user = self.context['request'].user
        if User.objects.exclude(pk=user.pk).filter(phone_number=value).exists():
            raise serializers.ValidationError("این شماره تلفن قبلاً استفاده شده است")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, min_length=8)
    confirm_password = serializers.CharField(required=True, write_only=True)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("رمز عبور فعلی اشتباه است")
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "رمز عبور جدید و تکرار آن یکسان نیستند"})
        return attrs

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()
        return user


class AdminUserSerializer(serializers.ModelSerializer):
    role_names = serializers.ListField(child=serializers.CharField(), read_only=True)
    password = serializers.CharField(write_only=True, required=False, min_length=8)

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
            "is_active",
            "is_superuser",
            "password",
        )
        read_only_fields = ("id", "role_names", "is_superuser")

    def validate_email(self, value):
        user = self.instance
        if User.objects.exclude(pk=user.pk if user else None).filter(email=value).exists():
            raise serializers.ValidationError("این ایمیل قبلاً استفاده شده است")
        return value

    def validate_phone_number(self, value):
        user = self.instance
        if User.objects.exclude(pk=user.pk if user else None).filter(phone_number=value).exists():
            raise serializers.ValidationError("این شماره تلفن قبلاً استفاده شده است")
        return value

    def validate_username(self, value):
        user = self.instance
        if User.objects.exclude(pk=user.pk if user else None).filter(username=value).exists():
            raise serializers.ValidationError("این نام کاربری قبلاً استفاده شده است")
        return value

    def validate_national_id(self, value):
        user = self.instance
        if User.objects.exclude(pk=user.pk if user else None).filter(national_id=value).exists():
            raise serializers.ValidationError("این کد ملی قبلاً استفاده شده است")
        return value

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


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
