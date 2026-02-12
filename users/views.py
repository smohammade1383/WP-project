from django.contrib.auth import login, logout
from django.contrib.auth.models import Group
from django.middleware.csrf import get_token
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdministrator
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    ProfileSerializer,
    RoleSerializer,
    SignupSerializer,
    UserRoleUpdateSerializer,
)
from .models import User


class CSRFTokenAPIView(APIView):
    """
    Get CSRF token for making state-changing requests
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        # This will set the CSRF cookie
        csrf_token = get_token(request)
        return Response({
            "detail": "CSRF cookie set",
            "csrftoken": csrf_token,
        }, status=status.HTTP_200_OK)


class SignupAPIView(generics.CreateAPIView):
    serializer_class = SignupSerializer
    permission_classes = [permissions.AllowAny]


@extend_schema(tags=["Auth"], request=LoginSerializer, responses={200: OpenApiTypes.OBJECT})
class LoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)
        
        # Debug logging
        print("=" * 50)
        print("Login successful:")
        print(f"User: {user.username}")
        print(f"Session key: {request.session.session_key}")
        print(f"Session cookie will be set: sessionid={request.session.session_key}")
        print("=" * 50)

        return Response(
            {
                "detail": "ورود با موفقیت انجام شد",
                "session_expires_at": request.session.get_expiry_date().isoformat(),
                "user": ProfileSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Auth"], request=None, responses={200: OpenApiTypes.OBJECT})
class LogoutAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"detail": "با موفقیت خارج شدید"}, status=status.HTTP_200_OK)


class ProfileAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
    
    def update(self, request, *args, **kwargs):
        # Debug logging
        print("=" * 50)
        print("Profile Update Request Debug:")
        print(f"User authenticated: {request.user.is_authenticated}")
        print(f"User: {request.user}")
        print(f"Cookies: {request.COOKIES}")
        print(f"CSRF Token from cookie: {request.COOKIES.get('csrftoken')}")
        print(f"CSRF Token from header: {request.META.get('HTTP_X_CSRFTOKEN')}")
        print(f"Session key: {request.session.session_key}")
        print("=" * 50)
        return super().update(request, *args, **kwargs)


@extend_schema(tags=["Auth"], request=ChangePasswordSerializer, responses={200: OpenApiTypes.OBJECT})
class ChangePasswordAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "رمز عبور با موفقیت تغییر کرد"}, status=status.HTTP_200_OK)


class RoleListCreateAPIView(generics.ListCreateAPIView):
    queryset = Group.objects.all().order_by("name")
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdministrator]


class UserListAPIView(generics.ListAPIView):
    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdministrator]
    queryset = User.objects.all().order_by("username")

    def get_queryset(self):
        queryset = super().get_queryset()
        query = self.request.query_params.get("q", "").strip()
        if not query:
            return queryset
        return queryset.filter(
            Q(username__icontains=query)
            | Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(email__icontains=query)
            | Q(phone_number__icontains=query)
            | Q(national_id__icontains=query)
        )


class RoleRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Group.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdministrator]


@extend_schema(
    tags=["RBAC"],
    request=UserRoleUpdateSerializer,
    responses={200: OpenApiTypes.OBJECT},
)
class UserRoleManagementAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdministrator]

    def post(self, request, user_id):
        serializer = UserRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = generics.get_object_or_404(User, id=user_id)
        roles = Group.objects.filter(name__in=serializer.validated_data["role_names"])
        user.groups.add(*roles)
        return Response({"detail": "Roles added.", "roles": user.role_names})

    def delete(self, request, user_id):
        serializer = UserRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = generics.get_object_or_404(User, id=user_id)
        roles = Group.objects.filter(name__in=serializer.validated_data["role_names"])
        user.groups.remove(*roles)
        return Response({"detail": "Roles removed.", "roles": user.role_names})


@extend_schema(tags=["RBAC"], request=None, responses={200: OpenApiTypes.OBJECT})
class UserRoleListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdministrator]

    def get(self, request, user_id):
        user = generics.get_object_or_404(User, id=user_id)
        return Response({"user_id": user.id, "roles": user.role_names, "timestamp": timezone.now().isoformat()})
