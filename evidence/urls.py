from django.urls import path

from .views import EvidenceListCreateAPIView, EvidenceRetrieveUpdateDestroyAPIView

urlpatterns = [
    path("", EvidenceListCreateAPIView.as_view(), name="evidence-list-create"),
    path("<int:pk>/", EvidenceRetrieveUpdateDestroyAPIView.as_view(), name="evidence-rud"),
]
