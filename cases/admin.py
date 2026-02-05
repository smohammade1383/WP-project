from django.contrib import admin

from .models import Case, CaseLog, CaseReview


class CaseReviewInline(admin.TabularInline):
    model = CaseReview
    extra = 0
    readonly_fields = ("created_at",)


class CaseLogInline(admin.TabularInline):
    model = CaseLog
    extra = 0
    readonly_fields = ("timestamp",)


@admin.register(Case)
class CaseAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "source_type", "status", "severity", "created_by", "created_at")
    list_filter = ("source_type", "status", "severity")
    search_fields = ("title", "description", "location")
    autocomplete_fields = ("created_by", "approved_by", "complainants")
    inlines = (CaseReviewInline, CaseLogInline)


@admin.register(CaseReview)
class CaseReviewAdmin(admin.ModelAdmin):
    list_display = ("id", "case", "reviewer", "step", "decision", "created_at")
    list_filter = ("step", "decision")
    autocomplete_fields = ("case", "reviewer")


@admin.register(CaseLog)
class CaseLogAdmin(admin.ModelAdmin):
    list_display = ("id", "case", "actor", "action", "timestamp")
    search_fields = ("action", "description")
    autocomplete_fields = ("case", "actor")
