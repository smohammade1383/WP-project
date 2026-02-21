import uuid

from django.db import models
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from cases.models import Case, Notification
from evidence.models import Evidence
from .models import PaymentTransaction, RewardReport
from .serializers import (
    PaymentCallbackSerializer,
    PaymentInitiateSerializer,
    PaymentTransactionSerializer,
    RewardDetectiveReviewSerializer,
    RewardOfficerReviewSerializer,
    RewardReportSerializer,
    RewardVerificationSerializer,
)

POLICE_ROLES = {
    "Administrator",
    "Chief",
    "Captain",
    "Sergeant",
    "Detective",
    "Police Officer",
    "Patrol Officer",
    "Cadet",
}

OFFICER_REVIEW_ROLES = {
    "Police Officer",
    "Patrol Officer",
}


def has_any_role(user, *roles):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    expected = set(roles)
    if "Sergeant" in expected:
        expected.add("Sergent")
    if "Sergent" in expected:
        expected.add("Sergeant")
    return any(role in expected for role in user.role_names)


def is_police_staff(user):
    return has_any_role(user, *POLICE_ROLES)


def push_notification(*, recipient, message, case_obj=None):
    if not recipient or not getattr(recipient, "is_active", False):
        return
    Notification.objects.create(
        recipient=recipient,
        case=case_obj,
        message=message,
    )


def notify_role_recipients(*, role_names, message, case_obj=None, exclude_user_id=None):
    from users.models import User

    normalized_roles = set(role_names)
    if "Sergeant" in normalized_roles:
        normalized_roles.add("Sergent")
    if "Sergent" in normalized_roles:
        normalized_roles.add("Sergeant")

    recipients = User.objects.filter(is_active=True).filter(
        models.Q(groups__name__in=normalized_roles) | models.Q(is_superuser=True)
    ).distinct()
    for recipient in recipients:
        if exclude_user_id and recipient.id == exclude_user_id:
            continue
        push_notification(recipient=recipient, message=message, case_obj=case_obj)


def notify_case_detective(case_obj, *, message, exclude_user_id=None):
    if not case_obj:
        return
    board = getattr(case_obj, "board", None)
    if board and board.detective_id and board.detective_id != exclude_user_id:
        push_notification(recipient=board.detective, message=message, case_obj=case_obj)


def get_responsible_detective(report):
    case_obj = report.case or (report.suspect_profile.case if report.suspect_profile_id else None)
    if not case_obj:
        return None, None
    board = getattr(case_obj, "board", None)
    if not board or not board.detective_id:
        return case_obj, None
    return case_obj, board.detective


def resolve_payment_url(request, tx):
    if tx.return_url:
        if tx.return_url.startswith(("http://", "https://")):
            return tx.return_url
        return request.build_absolute_uri(tx.return_url)
    return request.build_absolute_uri(f"/api/finance/payments/{tx.id}/return/?status=paid")


@extend_schema_view(
    get=extend_schema(tags=["Rewards"], summary="List reward reports"),
    post=extend_schema(tags=["Rewards"], summary="Submit reward report by citizen"),
)
class RewardReportListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = RewardReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        base = RewardReport.objects.select_related(
            "reporter",
            "suspect_profile",
            "case",
            "assigned_detective",
        )
        if is_police_staff(self.request.user):
            if has_any_role(
                self.request.user,
                "Detective",
            ) and not has_any_role(
                self.request.user,
                "Administrator",
                "Chief",
                "Captain",
                "Sergeant",
                "Police Officer",
                "Patrol Officer",
            ):
                return base.filter(
                    models.Q(assigned_detective=self.request.user)
                    | models.Q(reviewed_by_detective=self.request.user)
                ).distinct()
            return base
        return base.filter(reporter=self.request.user)

    def perform_create(self, serializer):
        report = serializer.save(reporter=self.request.user, status=RewardReport.Status.OFFICER_REVIEW)
        push_notification(
            recipient=self.request.user,
            case_obj=report.case,
            message=f"گزارش پاداش #{report.id} ثبت شد و در صف بررسی افسر قرار گرفت.",
        )
        notify_role_recipients(
            role_names=OFFICER_REVIEW_ROLES,
            case_obj=report.case,
            exclude_user_id=self.request.user.id,
            message=f"گزارش پاداش جدید #{report.id} ثبت شد و نیاز به بررسی افسر دارد.",
        )


@extend_schema_view(
    get=extend_schema(tags=["Payments"], summary="List payment transactions"),
)
class PaymentTransactionListAPIView(generics.ListAPIView):
    serializer_class = PaymentTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        base = PaymentTransaction.objects.select_related("case", "suspect_profile", "payer").all()
        if is_police_staff(self.request.user):
            return base
        return base.filter(
            models.Q(payer=self.request.user) | models.Q(suspect_profile__suspect=self.request.user)
        ).distinct()


@extend_schema(
    tags=["Rewards"],
    summary="Officer reviews reward report",
    request=RewardOfficerReviewSerializer,
    responses={200: RewardReportSerializer},
)
class RewardOfficerReviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, report_id):
        if not has_any_role(request.user, *OFFICER_REVIEW_ROLES):
            raise PermissionDenied("Only police officer roles can review reward submissions.")

        report = get_object_or_404(RewardReport, id=report_id)
        if report.status in {RewardReport.Status.REJECTED, RewardReport.Status.APPROVED}:
            raise ValidationError({"detail": "This report is already finalized."})
        if report.status == RewardReport.Status.DETECTIVE_REVIEW:
            raise ValidationError({"detail": "This report is already forwarded to detective queue."})

        serializer = RewardOfficerReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = serializer.validated_data["action"]
        case_obj, responsible_detective = get_responsible_detective(report)
        report.reviewed_by_officer = request.user
        if action == "reject":
            report.status = RewardReport.Status.REJECTED
            report.assigned_detective = None
            result_message = f"گزارش پاداش #{report.id} توسط افسر رد شد."
        else:
            if not case_obj:
                raise ValidationError({"case": "گزارش باید به یک پرونده معتبر متصل باشد."})
            if not responsible_detective:
                raise ValidationError(
                    {"detail": "برای این پرونده کارآگاه مسئول تعریف نشده است. ابتدا کارآگاه پرونده را تعیین کنید."}
                )
            report.status = RewardReport.Status.DETECTIVE_REVIEW
            report.assigned_detective = responsible_detective
            result_message = (
                f"گزارش پاداش #{report.id} توسط افسر تایید و برای کارآگاه مسئول پرونده ارسال شد."
            )
        report.save(update_fields=["reviewed_by_officer", "status", "assigned_detective"])
        push_notification(
            recipient=report.reporter,
            case_obj=case_obj or report.case,
            message=result_message,
        )
        if action != "reject":
            if responsible_detective and responsible_detective.id != request.user.id:
                push_notification(
                    recipient=responsible_detective,
                    case_obj=case_obj,
                    message=f"گزارش پاداش #{report.id} برای بررسی شما ارجاع شد.",
                )

        return Response(RewardReportSerializer(report).data)


@extend_schema(
    tags=["Rewards"],
    summary="Detective approves/rejects reward",
    request=RewardDetectiveReviewSerializer,
    responses={200: RewardReportSerializer},
)
class RewardDetectiveReviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, report_id):
        if not has_any_role(request.user, "Detective", "Administrator"):
            raise PermissionDenied("Only detective roles can finalize reward reports.")

        report = get_object_or_404(RewardReport, id=report_id)
        if report.status in {RewardReport.Status.REJECTED, RewardReport.Status.APPROVED}:
            raise ValidationError({"detail": "This report is already finalized."})
        if report.status != RewardReport.Status.DETECTIVE_REVIEW:
            raise ValidationError({"detail": "Report must be in detective review queue."})

        serializer = RewardDetectiveReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]

        related_case, responsible_detective = get_responsible_detective(report)
        if not related_case:
            raise ValidationError({"case": "A related case is required to finalize this report."})

        is_admin = has_any_role(request.user, "Administrator")
        expected_detective = report.assigned_detective or responsible_detective
        if not expected_detective and not is_admin:
            raise ValidationError(
                {"detail": "No responsible detective is assigned to this case yet."}
            )
        if (
            expected_detective
            and request.user.id != expected_detective.id
            and not is_admin
        ):
            raise PermissionDenied("Only the assigned detective can finalize this reward report.")

        if report.case_id != related_case.id:
            report.case = related_case
        if not report.assigned_detective_id and expected_detective:
            report.assigned_detective = expected_detective

        report.reviewed_by_detective = request.user
        if action == "reject":
            report.status = RewardReport.Status.REJECTED
            report.save(
                update_fields=[
                    "reviewed_by_detective",
                    "status",
                    "case",
                    "assigned_detective",
                ]
            )
            push_notification(
                recipient=report.reporter,
                case_obj=report.case,
                message=f"گزارش پاداش #{report.id} توسط کارآگاه رد شد.",
            )
            if report.reviewed_by_officer_id and report.reviewed_by_officer_id != request.user.id:
                push_notification(
                    recipient=report.reviewed_by_officer,
                    case_obj=report.case,
                    message=f"گزارش پاداش #{report.id} توسط کارآگاه رد شد.",
                )
            return Response(RewardReportSerializer(report).data)

        report.status = RewardReport.Status.APPROVED
        report.save(
            update_fields=[
                "reviewed_by_detective",
                "status",
                "unique_code",
                "reward_amount",
                "case",
                "assigned_detective",
            ]
        )
        Evidence.objects.create(
            case=related_case,
            title=f"Informant Report #{report.id}",
            description=report.description,
            type=Evidence.Type.OTHER,
            created_by=request.user,
        )
        report.refresh_from_db()
        push_notification(
            recipient=report.reporter,
            case_obj=report.case,
            message=(
                f"گزارش پاداش #{report.id} تایید شد. کد رهگیری: {report.unique_code} | مبلغ: {report.reward_amount:,} ریال"
            ),
        )
        if report.reviewed_by_officer_id and report.reviewed_by_officer_id != request.user.id:
            push_notification(
                recipient=report.reviewed_by_officer,
                case_obj=report.case,
                message=f"گزارش پاداش #{report.id} توسط کارآگاه تایید نهایی شد.",
            )
        return Response(RewardReportSerializer(report).data)


@extend_schema(
    tags=["Rewards"],
    summary="Verify reward code and amount",
    request=None,
    responses={200: OpenApiTypes.OBJECT},
    parameters=[
        OpenApiParameter(name="national_id", type=str, location=OpenApiParameter.QUERY, required=True),
        OpenApiParameter(name="unique_code", type=str, location=OpenApiParameter.QUERY, required=False),
        OpenApiParameter(name="tracking_code", type=str, location=OpenApiParameter.QUERY, required=False),
    ],
)
class RewardVerifyAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_police_staff(request.user):
            raise PermissionDenied("Only police roles can verify reward payouts.")

        serializer = RewardVerificationSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        report = get_object_or_404(
            RewardReport.objects.select_related("reporter"),
            unique_code=serializer.validated_data["resolved_code"],
            reporter__national_id=serializer.validated_data["national_id"],
            status=RewardReport.Status.APPROVED,
        )
        return Response(
            {
                "report_id": report.id,
                "tracking_code": report.unique_code,
                "reward_amount": report.reward_amount,
                "reporter": {
                    "id": report.reporter.id,
                    "username": report.reporter.username,
                    "national_id": report.reporter.national_id,
                    "first_name": report.reporter.first_name,
                    "last_name": report.reporter.last_name,
                },
            }
        )


@extend_schema(
    tags=["Payments"],
    summary="Initiate bail/fine transaction",
    request=PaymentInitiateSerializer,
    responses={201: OpenApiTypes.OBJECT},
)
class PaymentInitiateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not is_police_staff(request.user):
            raise PermissionDenied("Only police roles can initiate payments.")

        serializer = PaymentInitiateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data["transaction_type"] not in {
            PaymentTransaction.TransactionType.BAIL,
            PaymentTransaction.TransactionType.FINE,
        }:
            raise ValidationError({"transaction_type": "Only bail/fine transactions are allowed in this flow."})

        suspect_profile = data["suspect_profile"]
        severity = suspect_profile.case.severity
        is_criminal = suspect_profile.suspect.has_role("Criminal")

        if is_criminal:
            if severity != Case.Severity.LEVEL_3 or not data.get("sergeant_approved", False):
                raise ValidationError(
                    {"suspect_profile": "Criminals are eligible only for level-3 crimes with sergeant approval."}
                )
        else:
            if severity not in {Case.Severity.LEVEL_2, Case.Severity.LEVEL_3}:
                raise ValidationError(
                    {"suspect_profile": "Only suspects of level-2 or level-3 crimes can use this payment flow."}
                )

        tx = PaymentTransaction.objects.create(
            case=suspect_profile.case,
            suspect_profile=suspect_profile,
            payer=suspect_profile.suspect,
            amount=data["amount"],
            transaction_type=data["transaction_type"],
            gateway_reference=f"SIM-{uuid.uuid4().hex[:16].upper()}",
            return_url=data.get("return_url", ""),
        )

        payment_url = resolve_payment_url(request, tx)
        if tx.payer_id:
            push_notification(
                recipient=tx.payer,
                case_obj=tx.case,
                message=(
                    f"تراکنش {tx.get_transaction_type_display()} #{tx.id} به مبلغ {tx.amount:,} ریال ایجاد شد."
                ),
            )
        return Response(
            {
                "transaction": PaymentTransactionSerializer(tx).data,
                "payment_url": payment_url,
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(
    tags=["Payments"],
    summary="Start payment for an initiated transaction",
    request=None,
    responses={200: OpenApiTypes.OBJECT},
)
class PaymentStartAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, transaction_id):
        tx = get_object_or_404(
            PaymentTransaction.objects.select_related("suspect_profile__suspect"),
            id=transaction_id,
        )

        is_owner = tx.payer_id == request.user.id
        is_suspect_owner = bool(tx.suspect_profile_id and tx.suspect_profile.suspect_id == request.user.id)
        if not (is_police_staff(request.user) or is_owner or is_suspect_owner):
            raise PermissionDenied("You do not have access to this transaction.")

        if tx.status != PaymentTransaction.Status.INITIATED:
            raise ValidationError({"detail": "Only initiated transactions can be paid."})

        payment_url = resolve_payment_url(request, tx)
        return Response(
            {
                "transaction": PaymentTransactionSerializer(tx).data,
                "payment_url": payment_url,
            }
        )


@extend_schema(
    tags=["Payments"],
    summary="Payment gateway callback endpoint",
    request=PaymentCallbackSerializer,
    responses={200: PaymentTransactionSerializer},
)
class PaymentCallbackAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PaymentCallbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tx = None
        if serializer.validated_data.get("transaction_id"):
            tx = get_object_or_404(PaymentTransaction, id=serializer.validated_data["transaction_id"])
        elif serializer.validated_data.get("gateway_reference"):
            tx = get_object_or_404(
                PaymentTransaction,
                gateway_reference=serializer.validated_data["gateway_reference"],
            )

        callback_status = serializer.validated_data["normalized_status"]
        payload = serializer.validated_data.get("payload", {})

        tx.callback_payload = payload
        if callback_status == "paid":
            tx.status = PaymentTransaction.Status.PAID
            tx.paid_at = timezone.now()
            if (
                tx.suspect_profile_id
                and tx.transaction_type in {PaymentTransaction.TransactionType.BAIL, PaymentTransaction.TransactionType.FINE}
            ):
                profile = tx.suspect_profile
                if profile.is_arrested:
                    profile.is_arrested = False
                    profile.save(update_fields=["is_arrested"])
        elif tx.status != PaymentTransaction.Status.PAID:
            tx.status = PaymentTransaction.Status.FAILED
            tx.paid_at = None
        tx.save(update_fields=["status", "paid_at", "callback_payload"])

        if tx.payer_id:
            push_notification(
                recipient=tx.payer,
                case_obj=tx.case,
                message=(
                    f"وضعیت تراکنش #{tx.id}: {'موفق' if tx.status == PaymentTransaction.Status.PAID else 'ناموفق'}."
                ),
            )
        suspect_user = tx.suspect_profile.suspect if tx.suspect_profile_id else None
        if suspect_user and suspect_user.id != tx.payer_id:
            push_notification(
                recipient=suspect_user,
                case_obj=tx.case,
                message=(
                    f"وضعیت تراکنش مرتبط با پرونده شما (#{tx.id}) به "
                    f"{'موفق' if tx.status == PaymentTransaction.Status.PAID else 'ناموفق'} تغییر کرد."
                ),
            )
        notify_case_detective(
            tx.case,
            exclude_user_id=tx.payer_id,
            message=(
                f"وضعیت تراکنش مالی پرونده #{tx.case_id}: "
                f"{'موفق' if tx.status == PaymentTransaction.Status.PAID else 'ناموفق'}."
            ),
        )
        notify_role_recipients(
            role_names=("Sergeant", "Administrator"),
            case_obj=tx.case,
            exclude_user_id=tx.payer_id,
            message=(
                f"وضعیت تراکنش مالی پرونده #{tx.case_id} برای مظنون "
                f"{'موفق' if tx.status == PaymentTransaction.Status.PAID else 'ناموفق'} ثبت شد."
            ),
        )

        return Response(PaymentTransactionSerializer(tx).data)


@extend_schema(tags=["Payments"], summary="Payment return page", request=None, responses={200: OpenApiTypes.STR})
class PaymentReturnPageAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, transaction_id):
        tx = get_object_or_404(PaymentTransaction, id=transaction_id)
        page_status = request.query_params.get("status", tx.status)
        context = {
            "transaction": tx,
            "page_status": page_status,
        }
        return render(request, "finance/payment_return.html", context)
