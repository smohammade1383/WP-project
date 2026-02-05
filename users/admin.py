from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group

from .models import RoleProfile, User


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


class RoleProfileInline(admin.StackedInline):
    model = RoleProfile
    can_delete = False
    extra = 0


admin.site.unregister(Group)


@admin.register(Group)
class CustomGroupAdmin(GroupAdmin):
    inlines = (RoleProfileInline,)
    search_fields = ("name",)
