from django.contrib import admin

from .models import (
    BoardItem,
    BoardLink,
    CaptainDecision,
    Case,
    CaseLog,
    Complaint,
    ComplaintReview,
    DetectiveBoard,
    InterrogationScore,
    SuspectCaseProfile,
)


@admin.register(Case)
class CaseAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "source_type", "status", "severity", "created_by", "created_at")
    list_filter = ("source_type", "status", "severity")
    search_fields = ("title", "description", "location")
    autocomplete_fields = ("created_by", "approved_by", "complainants", "witnesses", "suspects")


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "submitter", "status", "invalid_attempt_count", "created_at")
    list_filter = ("status",)
    autocomplete_fields = ("case", "submitter", "complainants")


admin.site.register(ComplaintReview)
admin.site.register(CaseLog)
admin.site.register(DetectiveBoard)
admin.site.register(BoardItem)
admin.site.register(BoardLink)
admin.site.register(SuspectCaseProfile)
admin.site.register(InterrogationScore)
admin.site.register(CaptainDecision)
