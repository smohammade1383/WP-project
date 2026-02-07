from django.urls import path

from .views import AggregatedStatsAPIView, PublicWantedDetailAPIView, PublicWantedListAPIView

urlpatterns = [
    path("wanted/", PublicWantedListAPIView.as_view(), name="people-wanted-list"),
    path("wanted/<int:suspect_id>/", PublicWantedDetailAPIView.as_view(), name="people-wanted-detail"),
    path("stats/", AggregatedStatsAPIView.as_view(), name="people-aggregated-stats"),
]
