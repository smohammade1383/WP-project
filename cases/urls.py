from django.urls import path

from .views import AggregatedStatsAPIView

urlpatterns = [
    path("stats/aggregated/", AggregatedStatsAPIView.as_view(), name="aggregated-stats"),
]
