from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "id",
        "username",
        "email",
        "national_id",
        "phone_number",
        "is_staff",
        "is_active",
    )
    list_filter = ("is_staff", "is_superuser", "is_active", "groups")
    search_fields = ("username", "email", "national_id", "phone_number")
    ordering = ("id",)

    fieldsets = UserAdmin.fieldsets + (
        ("Project Info", {"fields": ("national_id", "phone_number")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Project Info", {"fields": ("national_id", "phone_number")}),
    )
