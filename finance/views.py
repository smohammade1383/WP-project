import uuid
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse
from urllib.request import Request, urlopen

from django.db import models
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from cases.notify import notify_roles, notify_users
from cases.models import Case
from evidence.models import Evidence
from people.models import CitizenTip
from .models import PaymentTransaction, RewardReport
from .serializers import (
    BailRequestSerializer,
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
    "Sergeant",
    "Captain",
    "Chief",
    "Administrator",
}
DETECTIVE_ROLES = {"Detective", "Administrator"}

ZARINPAL_SANDBOX_REQUEST_URL = "https://sandbox.zarinpal.com/pg/v4/payment/request.json"
ZARINPAL_SANDBOX_VERIFY_URL = "https://sandbox.zarinpal.com/pg/v4/payment/verify.json"
ZARINPAL_SANDBOX_START_URL = "https://sandbox.zarinpal.com/pg/StartPay/"
ZARINPAL_MAX_AMOUNT = 2_000_000_000


def has_any_role(user, *roles):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    expected = set(roles)
    return any(role in expected for role in user.role_names)


def is_police_staff(user):
    return has_any_role(user, *POLICE_ROLES)


def _http_json_post(url, payload, timeout=15):
    body = json.dumps(payload).encode("utf-8")
    req = Request(
        url=url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def _extract_http_error_payload(exc):
    payload = {}
    try:
        raw = exc.read().decode("utf-8")
        payload = json.loads(raw) if raw else {}
    except Exception:
        payload = {}
    return payload


def _extract_provider_message(payload):
    if not isinstance(payload, dict):
        return ""
    data_block = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    errors_block = payload.get("errors") if isinstance(payload.get("errors"), dict) else {}

    message = data_block.get("message")
    if isinstance(message, str) and message.strip():
        return message
    message = errors_block.get("message")
    if isinstance(message, str) and message.strip():
        return message
    return ""


def zarinpal_request_payment(*, merchant_id, amount, description, callback_url):
    payload = {
        "merchant_id": merchant_id,
        "amount": amount,
        "description": description,
        "callback_url": callback_url,
    }
    return _http_json_post(ZARINPAL_SANDBOX_REQUEST_URL, payload)


def zarinpal_verify_payment(*, merchant_id, amount, authority):
    payload = {
        "merchant_id": merchant_id,
        "amount": amount,
        "authority": authority,
    }
    return _http_json_post(ZARINPAL_SANDBOX_VERIFY_URL, payload)


def _append_query_params(base_url, extra_params):
    parsed = urlparse(base_url)
    current_query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    current_query.update({k: str(v) for k, v in extra_params.items() if v is not None})
    new_query = urlencode(current_query)
    return urlunparse(parsed._replace(query=new_query))


def _frontend_bail_result_url(success, **params):
    default = "http://localhost:5173/legal-bail"
    base_url = os.getenv("FRONTEND_BAIL_RETURN_URL", default).strip() or default
    merged = {"payment": "success" if success else "failed", **params}
    return _append_query_params(base_url, merged)


def _is_bail_eligible(suspect_profile, *, actor=None, sergeant_approved=False):
    severity = suspect_profile.case.severity
    is_criminal = suspect_profile.suspect.has_role("Criminal")

    if is_criminal:
        has_sergeant_signoff = False
        if actor is not None:
            has_sergeant_signoff = has_any_role(actor, "Sergeant", "Administrator")
        else:
            # Backward-compatible branch for old callers.
            has_sergeant_signoff = bool(sergeant_approved)

        if severity != Case.Severity.LEVEL_3 or not has_sergeant_signoff:
            raise ValidationError(
                {"suspect_profile": "Criminals are eligible only for level-3 crimes with sergeant approval."}
            )
        return

    if severity not in {Case.Severity.LEVEL_2, Case.Severity.LEVEL_3}:
        raise ValidationError(
            {"suspect_profile": "Only suspects of level-2 or level-3 crimes can use this payment flow."}
        )


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
        if is_police_staff(self.request.user):
            return RewardReport.objects.all().select_related("reporter", "suspect_profile", "case")
        return RewardReport.objects.filter(reporter=self.request.user).select_related("reporter", "suspect_profile", "case")

    def perform_create(self, serializer):
        report = serializer.save(reporter=self.request.user, status=RewardReport.Status.OFFICER_REVIEW)
        notify_roles(
            OFFICER_REVIEW_ROLES,
            message=f"گزارش پاداش #{report.id} ثبت شد و در صف بررسی افسر پلیس قرار گرفت.",
            case=report.case,
            exclude_user_ids={self.request.user.id},
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
        if not has_any_role(
            request.user,
            "Police Officer",
            "Patrol Officer",
            "Sergeant",
            "Captain",
            "Chief",
            "Administrator",
        ):
            raise PermissionDenied("Only officer+ roles can review reward submissions.")

        report = get_object_or_404(RewardReport, id=report_id)
        if report.status in {RewardReport.Status.REJECTED, RewardReport.Status.APPROVED}:
            raise ValidationError({"detail": "This report is already finalized."})
        if report.status == RewardReport.Status.DETECTIVE_REVIEW:
            raise ValidationError({"detail": "This report is already forwarded to detective queue."})

        serializer = RewardOfficerReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = serializer.validated_data["action"]
        report.reviewed_by_officer = request.user
        if action == "reject":
            report.status = RewardReport.Status.REJECTED
            report.save(update_fields=["reviewed_by_officer", "status"])
            notify_users(
                [report.reporter],
                message=f"گزارش پاداش #{report.id} در مرحله افسر پلیس رد شد.",
                case=report.case,
                exclude_user_ids={request.user.id},
            )
        else:
            report.status = RewardReport.Status.DETECTIVE_REVIEW
            report.save(update_fields=["reviewed_by_officer", "status"])
            target_case = report.case or (report.suspect_profile.case if report.suspect_profile_id else None)
            if target_case and target_case.assigned_detective_id:
                notify_users(
                    [target_case.assigned_detective],
                    message=f"گزارش پاداش #{report.id} توسط افسر تایید و برای شما ارسال شد.",
                    case=target_case,
                    exclude_user_ids={request.user.id},
                )
            else:
                notify_roles(
                    DETECTIVE_ROLES,
                    message=f"گزارش پاداش #{report.id} به صف کارآگاه منتقل شد.",
                    case=target_case or report.case,
                    exclude_user_ids={request.user.id},
                )
            notify_users(
                [report.reporter],
                message=f"گزارش پاداش #{report.id} توسط افسر تایید و به کارآگاه ارجاع شد.",
                case=target_case or report.case,
                exclude_user_ids={request.user.id},
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

        report.reviewed_by_detective = request.user
        if action == "reject":
            report.status = RewardReport.Status.REJECTED
            report.save(update_fields=["reviewed_by_detective", "status"])
            notify_users(
                [report.reporter],
                message=f"گزارش پاداش #{report.id} توسط کارآگاه رد شد.",
                case=report.case,
                exclude_user_ids={request.user.id},
            )
            return Response(RewardReportSerializer(report).data)

        if not report.suspect_profile:
            raise ValidationError({"suspect_profile": "An associated suspect profile is required for reward approval."})

        related_case = report.case or report.suspect_profile.case
        if not related_case:
            raise ValidationError({"case": "A related case is required to finalize this report."})

        if report.case_id != related_case.id:
            report.case = related_case

        report.status = RewardReport.Status.APPROVED
        report.save(update_fields=["reviewed_by_detective", "status", "unique_code", "reward_amount", "case"])
        Evidence.objects.create(
            case=related_case,
            title=f"Informant Report #{report.id}",
            description=report.description,
            type=Evidence.Type.OTHER,
            created_by=request.user,
        )
        report.refresh_from_db()
        notify_users(
            [report.reporter],
            message=(
                f"گزارش پاداش #{report.id} تایید شد. "
                f"کد یکتا: {report.unique_code} | مبلغ: {report.reward_amount:,} ریال"
            ),
            case=related_case,
            exclude_user_ids={request.user.id},
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
        resolved_code = serializer.validated_data["resolved_code"]
        national_id = serializer.validated_data["national_id"]

        report = RewardReport.objects.select_related("reporter").filter(
            unique_code=resolved_code,
            reporter__national_id=national_id,
            status=RewardReport.Status.APPROVED,
        ).first()
        if report is not None:
            return Response(
                {
                    "source": "reward_report",
                    "report_id": report.id,
                    "tip_id": None,
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

        tip = CitizenTip.objects.select_related("reporter").filter(
            unique_tracking_code=resolved_code,
            reporter__national_id=national_id,
            status=CitizenTip.Status.USEFUL,
        ).first()
        if tip is None:
            raise ValidationError({"detail": "No approved reward record found for these credentials."})

        return Response(
            {
                "source": "citizen_tip",
                "report_id": None,
                "tip_id": tip.id,
                "tracking_code": tip.unique_tracking_code,
                "reward_amount": tip.reward_amount,
                "reporter": {
                    "id": tip.reporter.id,
                    "username": tip.reporter.username,
                    "national_id": tip.reporter.national_id,
                    "first_name": tip.reporter.first_name,
                    "last_name": tip.reporter.last_name,
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
        if not has_any_role(request.user, "Sergeant", "Administrator"):
            raise PermissionDenied("Only sergeant role can set bail/fine amounts.")

        serializer = PaymentInitiateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data["amount"] > ZARINPAL_MAX_AMOUNT:
            raise ValidationError(
                {"message": f"Amount must not exceed {ZARINPAL_MAX_AMOUNT:,} for ZarinPal sandbox."}
            )

        if data["transaction_type"] not in {
            PaymentTransaction.TransactionType.BAIL,
            PaymentTransaction.TransactionType.FINE,
        }:
            raise ValidationError({"transaction_type": "Only bail/fine transactions are allowed in this flow."})

        suspect_profile = data["suspect_profile"]
        already_paid = suspect_profile.paymenttransaction_set.filter(
            status=PaymentTransaction.Status.PAID,
            transaction_type__in=[
                PaymentTransaction.TransactionType.BAIL,
                PaymentTransaction.TransactionType.FINE,
            ],
        ).exists()
        if already_paid:
            raise ValidationError(
                {"suspect_profile": "Bail/fine was already paid for this profile and cannot be initiated again."}
            )

        if not suspect_profile.is_arrested:
            raise ValidationError({"suspect_profile": "Bail/fine payment is only available for arrested suspects."})
        _is_bail_eligible(
            suspect_profile,
            actor=request.user,
            sergeant_approved=data.get("sergeant_approved", False),
        )

        suspect_profile.is_bail_allowed = True
        suspect_profile.bail_amount = data["amount"]
        suspect_profile.save(update_fields=["is_bail_allowed", "bail_amount"])

        tx = PaymentTransaction.objects.create(
            case=suspect_profile.case,
            suspect_profile=suspect_profile,
            payer=suspect_profile.suspect,
            amount=data["amount"],
            transaction_type=data["transaction_type"],
            gateway_reference=f"SIM-{uuid.uuid4().hex[:16].upper()}",
            return_url=data.get("return_url", ""),
        )
        notify_users(
            [suspect_profile.suspect],
            message=(
                f"برای پرونده #{suspect_profile.case_id} تراکنش {tx.get_transaction_type_display()} "
                f"به مبلغ {tx.amount:,} ریال ایجاد شد."
            ),
            case=suspect_profile.case,
            exclude_user_ids={request.user.id},
        )

        payment_url = resolve_payment_url(request, tx)
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
        if not (is_owner or is_suspect_owner):
            raise PermissionDenied("Only the transaction owner can start this payment.")

        if tx.status != PaymentTransaction.Status.INITIATED:
            raise ValidationError({"detail": "Only initiated transactions can be paid."})
        if tx.suspect_profile_id and not tx.suspect_profile.is_bail_allowed:
            raise ValidationError({"detail": "Bail payment is not allowed for this profile."})

        payment_url = resolve_payment_url(request, tx)
        return Response(
            {
                "transaction": PaymentTransactionSerializer(tx).data,
                "payment_url": payment_url,
            }
        )


@extend_schema(
    tags=["Payments"],
    summary="Request ZarinPal sandbox authority for bail payment",
    request=BailRequestSerializer,
    responses={201: OpenApiTypes.OBJECT},
)
class BailPaymentRequestAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = BailRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        tx = None

        if data.get("transaction_id"):
            tx = get_object_or_404(
                PaymentTransaction.objects.select_related("suspect_profile__suspect"),
                id=data["transaction_id"],
            )
            if tx.transaction_type not in {
                PaymentTransaction.TransactionType.BAIL,
                PaymentTransaction.TransactionType.FINE,
            }:
                raise ValidationError({"transaction_id": "Only bail/fine transactions can use this endpoint."})
            if tx.status != PaymentTransaction.Status.INITIATED:
                raise ValidationError({"transaction_id": "Only initiated transactions can be paid."})
            if tx.suspect_profile_id is None:
                raise ValidationError({"transaction_id": "Transaction must be linked to a suspect profile."})
            suspect_profile = tx.suspect_profile
            is_owner = suspect_profile.suspect_id == request.user.id
            is_payer = tx.payer_id == request.user.id
            if not (is_owner or is_payer):
                raise PermissionDenied("Only the transaction owner can continue this payment.")
            if not suspect_profile.is_arrested:
                raise ValidationError({"suspect_profile": "Bail payment is only available for arrested suspects."})
            if not suspect_profile.is_bail_allowed:
                raise ValidationError({"suspect_profile": "Bail is not allowed for this profile."})
            if suspect_profile.bail_amount and tx.amount != suspect_profile.bail_amount:
                raise ValidationError({"transaction_id": "Transaction amount does not match approved bail amount."})
            if tx.amount > ZARINPAL_MAX_AMOUNT:
                raise ValidationError(
                    {"message": f"Transaction amount exceeds ZarinPal sandbox limit ({ZARINPAL_MAX_AMOUNT:,})."}
                )
        else:
            # Legacy path: creating a fresh payment request is restricted to sergeant/admin.
            if not has_any_role(request.user, "Sergeant", "Administrator"):
                raise PermissionDenied("Only sergeant role can create a new bail transaction.")

            suspect_profile = data["suspect_profile"]
            if not suspect_profile.is_arrested:
                raise ValidationError({"suspect_profile": "Bail payment is only available for arrested suspects."})
            if not suspect_profile.is_bail_allowed:
                raise ValidationError({"suspect_profile": "Bail is not allowed for this profile."})

            _is_bail_eligible(
                suspect_profile,
                actor=request.user,
                sergeant_approved=data.get("sergeant_approved", False),
            )

            amount = suspect_profile.bail_amount
            if amount is None:
                raise ValidationError({"suspect_profile": "Approved bail amount is missing for this profile."})
            if data.get("amount") is not None and data["amount"] != amount:
                raise ValidationError({"amount": "Must match approved bail amount set by sergeant."})
            if amount > ZARINPAL_MAX_AMOUNT:
                raise ValidationError(
                    {"message": f"Approved bail amount exceeds ZarinPal sandbox limit ({ZARINPAL_MAX_AMOUNT:,})."}
                )

            tx = PaymentTransaction.objects.create(
                case=suspect_profile.case,
                suspect_profile=suspect_profile,
                payer=suspect_profile.suspect,
                amount=amount,
                transaction_type=PaymentTransaction.TransactionType.BAIL,
                status=PaymentTransaction.Status.INITIATED,
                return_url=data.get("return_url", ""),
            )
            notify_users(
                [suspect_profile.suspect],
                message=(
                    f"برای پرونده #{suspect_profile.case_id} درخواست پرداخت وثیقه "
                    f"به مبلغ {amount:,} ریال ثبت شد."
                ),
                case=suspect_profile.case,
                exclude_user_ids={request.user.id},
            )

        callback_url = request.build_absolute_uri(reverse("bail-verify"))
        merchant_id = os.getenv("ZARINPAL_MERCHANT_ID", "00000000-0000-0000-0000-000000000000")
        description = data.get("description", "").strip() or f"Bail payment for suspect profile #{tx.suspect_profile_id}"

        try:
            provider_resp = zarinpal_request_payment(
                merchant_id=merchant_id,
                amount=tx.amount,
                description=description,
                callback_url=callback_url,
            )
        except HTTPError as exc:
            provider_payload = _extract_http_error_payload(exc)
            provider_message = _extract_provider_message(provider_payload) or str(exc)
            tx.status = PaymentTransaction.Status.FAILED
            tx.callback_payload = {"provider_error": provider_message, "provider_payload": provider_payload}
            tx.save(update_fields=["status", "callback_payload"])
            if tx.suspect_profile_id:
                notify_users(
                    [tx.suspect_profile.suspect],
                    message=f"درخواست پرداخت وثیقه پرونده #{tx.suspect_profile.case_id} با خطا مواجه شد.",
                    case=tx.suspect_profile.case,
                )
            raise ValidationError(
                {
                    "message": provider_message,
                    "provider": provider_payload,
                }
            )
        except (URLError, TimeoutError, ValueError) as exc:
            tx.status = PaymentTransaction.Status.FAILED
            tx.callback_payload = {"provider_error": str(exc)}
            tx.save(update_fields=["status", "callback_payload"])
            if tx.suspect_profile_id:
                notify_users(
                    [tx.suspect_profile.suspect],
                    message=f"درخواست پرداخت وثیقه پرونده #{tx.suspect_profile.case_id} با خطا مواجه شد.",
                    case=tx.suspect_profile.case,
                )
            raise ValidationError({"message": "Could not reach ZarinPal sandbox endpoint."})

        data_block = provider_resp.get("data") or {}
        code = data_block.get("code")
        authority = data_block.get("authority")
        if code != 100 or not authority:
            provider_message = _extract_provider_message(provider_resp) or "ZarinPal request was rejected."
            tx.status = PaymentTransaction.Status.FAILED
            tx.callback_payload = provider_resp
            tx.save(update_fields=["status", "callback_payload"])
            raise ValidationError({"message": provider_message, "provider": provider_resp})

        tx.gateway_reference = authority
        tx.callback_payload = provider_resp
        tx.save(update_fields=["gateway_reference", "callback_payload"])
        if tx.suspect_profile_id:
            notify_users(
                [tx.suspect_profile.suspect],
                message=(
                    f"درگاه پرداخت پرونده #{tx.suspect_profile.case_id} آماده شد. "
                    "می‌توانید پرداخت را نهایی کنید."
                ),
                case=tx.suspect_profile.case,
                exclude_user_ids={request.user.id},
            )

        return Response(
            {
                "transaction": PaymentTransactionSerializer(tx).data,
                "authority": authority,
                "start_url": f"{ZARINPAL_SANDBOX_START_URL}{authority}",
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(
    tags=["Payments"],
    summary="ZarinPal sandbox callback verifier for bail payment",
    request=None,
    responses={302: OpenApiTypes.STR},
    parameters=[
        OpenApiParameter(name="Authority", type=str, location=OpenApiParameter.QUERY, required=True),
        OpenApiParameter(name="Status", type=str, location=OpenApiParameter.QUERY, required=True),
    ],
)
class BailPaymentVerifyAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        authority = (request.query_params.get("Authority") or "").strip()
        status_flag = (request.query_params.get("Status") or "").strip().lower()
        if not authority:
            return HttpResponseRedirect(_frontend_bail_result_url(False, reason="missing-authority"))

        tx = PaymentTransaction.objects.select_related("suspect_profile").filter(gateway_reference=authority).first()
        if tx is None:
            return HttpResponseRedirect(_frontend_bail_result_url(False, reason="transaction-not-found", authority=authority))

        if status_flag != "ok":
            tx.status = PaymentTransaction.Status.FAILED
            tx.callback_payload = {
                "authority": authority,
                "query_status": request.query_params.get("Status"),
                "reason": "gateway-cancelled",
            }
            tx.paid_at = None
            tx.save(update_fields=["status", "callback_payload", "paid_at"])
            if tx.suspect_profile_id:
                notify_users(
                    [tx.suspect_profile.suspect],
                    message=f"پرداخت وثیقه/جریمه پرونده #{tx.suspect_profile.case_id} لغو شد.",
                    case=tx.suspect_profile.case,
                )
            return HttpResponseRedirect(_frontend_bail_result_url(False, tx=tx.id, authority=authority, reason="gateway-cancelled"))

        merchant_id = os.getenv("ZARINPAL_MERCHANT_ID", "00000000-0000-0000-0000-000000000000")
        try:
            verify_resp = zarinpal_verify_payment(
                merchant_id=merchant_id,
                amount=tx.amount,
                authority=authority,
            )
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            tx.status = PaymentTransaction.Status.FAILED
            tx.callback_payload = {"provider_error": str(exc), "authority": authority}
            tx.paid_at = None
            tx.save(update_fields=["status", "callback_payload", "paid_at"])
            return HttpResponseRedirect(_frontend_bail_result_url(False, tx=tx.id, authority=authority, reason="verify-request-failed"))

        verify_data = verify_resp.get("data") or {}
        code = verify_data.get("code")
        ref_id = verify_data.get("ref_id")

        if code in {100, 101}:
            tx.status = PaymentTransaction.Status.PAID
            tx.paid_at = timezone.now()
            tx.callback_payload = {
                "authority": authority,
                "verify_response": verify_resp,
                "release_status": "RELEASED_ON_BAIL",
            }
            tx.save(update_fields=["status", "paid_at", "callback_payload"])

            if tx.suspect_profile_id:
                profile = tx.suspect_profile
                profile.is_arrested = False
                profile.is_bail_allowed = False
                profile.bail_amount = None
                profile.save(update_fields=["is_arrested", "is_bail_allowed", "bail_amount"])
                notify_users(
                    [profile.suspect],
                    message=f"پرداخت پرونده #{profile.case_id} موفق بود و وضعیت بازداشت رفع شد.",
                    case=profile.case,
                )

            return HttpResponseRedirect(
                _frontend_bail_result_url(True, tx=tx.id, authority=authority, ref_id=ref_id)
            )

        tx.status = PaymentTransaction.Status.FAILED
        tx.paid_at = None
        tx.callback_payload = {"authority": authority, "verify_response": verify_resp}
        tx.save(update_fields=["status", "paid_at", "callback_payload"])
        return HttpResponseRedirect(_frontend_bail_result_url(False, tx=tx.id, authority=authority, reason=f"verify-code-{code}"))


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
                profile.is_arrested = False
                profile.is_bail_allowed = False
                profile.bail_amount = None
                profile.save(update_fields=["is_arrested", "is_bail_allowed", "bail_amount"])
                notify_users(
                    [profile.suspect],
                    message=f"تراکنش پرونده #{profile.case_id} با موفقیت پرداخت شد.",
                    case=profile.case,
                )
        elif tx.status != PaymentTransaction.Status.PAID:
            tx.status = PaymentTransaction.Status.FAILED
            tx.paid_at = None
            if tx.suspect_profile_id:
                notify_users(
                    [tx.suspect_profile.suspect],
                    message=f"پرداخت پرونده #{tx.suspect_profile.case_id} ناموفق بود.",
                    case=tx.suspect_profile.case,
                )
        tx.save(update_fields=["status", "paid_at", "callback_payload"])

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
