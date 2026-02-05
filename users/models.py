from django.contrib.auth.models import AbstractUser, Group
from django.core.validators import RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    phone_validator = RegexValidator(
        regex=r"^09\d{9}$",
        message=_("Phone number must be 11 digits starting with 09."),
    )
    national_id_validator = RegexValidator(
        regex=r"^\d{10}$",
        message=_("National ID must be exactly 10 digits."),
    )

    national_id = models.CharField(
        _("National ID"),
        max_length=10,
        unique=True,
        validators=[national_id_validator],
    )
    phone_number = models.CharField(
        _("Phone Number"),
        max_length=11,
        unique=True,
        validators=[phone_validator],
    )
    email = models.EmailField(_("Email Address"), unique=True)

    REQUIRED_FIELDS = ["email", "national_id", "phone_number"]

    class Meta:
        verbose_name = _("User")
        verbose_name_plural = _("Users")

    @property
    def role_names(self):
        return list(self.groups.values_list("name", flat=True))

    def has_role(self, role_name: str) -> bool:
        return self.groups.filter(name__iexact=role_name).exists()

    def __str__(self):
        return self.username


class RoleProfile(models.Model):
    group = models.OneToOneField(Group, on_delete=models.CASCADE, related_name="profile")
    description = models.TextField(blank=True)

    class Meta:
        verbose_name = _("Role Profile")
        verbose_name_plural = _("Role Profiles")

    def __str__(self):
        return self.group.name
