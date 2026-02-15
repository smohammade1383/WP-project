from django.urls import path

from .views import (
    EvidenceListCreateAPIView,
    EvidenceOfficerPendingListAPIView,
    EvidenceOfficerReviewAPIView,
    EvidenceRetrieveUpdateDestroyAPIView,
)

urlpatterns = [
    path("", EvidenceListCreateAPIView.as_view(), name="evidence-list-create"),
    path("officer/pending/", EvidenceOfficerPendingListAPIView.as_view(), name="evidence-officer-pending"),
    path("<int:pk>/officer-review/", EvidenceOfficerReviewAPIView.as_view(), name="evidence-officer-review"),
    path("<int:pk>/", EvidenceRetrieveUpdateDestroyAPIView.as_view(), name="evidence-rud"),
]
