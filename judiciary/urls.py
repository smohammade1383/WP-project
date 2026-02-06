from django.urls import path

from .views import CaseComprehensiveReportAPIView, TrialCreateAPIView

urlpatterns = [
    path("trials/", TrialCreateAPIView.as_view(), name="trial-create"),
    path("reports/cases/<int:case_id>/", CaseComprehensiveReportAPIView.as_view(), name="case-comprehensive-report"),
]
