from django.urls import path

from .views import (
    PaymentCallbackAPIView,
    PaymentInitiateAPIView,
    PaymentReturnPageAPIView,
    RewardDetectiveReviewAPIView,
    RewardOfficerReviewAPIView,
    RewardReportListCreateAPIView,
    RewardVerifyAPIView,
)

urlpatterns = [
    path("reward-reports/", RewardReportListCreateAPIView.as_view(), name="reward-report-list-create"),
    path("reward-reports/<int:report_id>/officer-review/", RewardOfficerReviewAPIView.as_view(), name="reward-officer-review"),
    path("reward-reports/<int:report_id>/detective-review/", RewardDetectiveReviewAPIView.as_view(), name="reward-detective-review"),
    path("reward-reports/verify/", RewardVerifyAPIView.as_view(), name="reward-verify"),

    path("payments/initiate/", PaymentInitiateAPIView.as_view(), name="payment-initiate"),
    path("payments/callback/", PaymentCallbackAPIView.as_view(), name="payment-callback"),
    path("payments/<int:transaction_id>/return/", PaymentReturnPageAPIView.as_view(), name="payment-return"),
]
