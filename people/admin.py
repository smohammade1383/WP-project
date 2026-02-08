from django.contrib import admin

from .models import CitizenTip


@admin.register(CitizenTip)
class CitizenTipAdmin(admin.ModelAdmin):
    list_display = ("id", "reporter", "status", "case", "suspect_profile", "created_at")
    list_filter = ("status",)
    search_fields = ("description",)
