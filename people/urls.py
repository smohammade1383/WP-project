from django.urls import path

from .views import (
    AggregatedStatsAPIView,
    CitizenTipDetectiveReviewAPIView,
    CitizenTipListCreateAPIView,
    CitizenTipOfficerReviewAPIView,
    PublicWantedDetailAPIView,
    PublicWantedListAPIView,
)

urlpatterns = [
    path("wanted/", PublicWantedListAPIView.as_view(), name="people-wanted-list"),
    path("wanted/<int:suspect_id>/", PublicWantedDetailAPIView.as_view(), name="people-wanted-detail"),
    path("stats/", AggregatedStatsAPIView.as_view(), name="people-aggregated-stats"),
    path("tips/", CitizenTipListCreateAPIView.as_view(), name="people-tips"),
    path("tips/<int:tip_id>/officer-review/", CitizenTipOfficerReviewAPIView.as_view(), name="people-tips-officer-review"),
    path("tips/<int:tip_id>/detective-review/", CitizenTipDetectiveReviewAPIView.as_view(), name="people-tips-detective-review"),
]
