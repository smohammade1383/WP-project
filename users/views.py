from django.contrib.auth import login, logout
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdministrator
from .serializers import (
    LoginSerializer,
    ProfileSerializer,
    RoleSerializer,
    SignupSerializer,
    UserRoleUpdateSerializer,
)
from .models import User


class SignupAPIView(generics.CreateAPIView):
    serializer_class = SignupSerializer
    permission_classes = [permissions.AllowAny]


class LoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)

        return Response(
            {
                "detail": "Login successful.",
                "session_expires_at": request.session.get_expiry_date().isoformat(),
                "user": ProfileSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class LogoutAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out successfully."}, status=status.HTTP_200_OK)


class ProfileAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class RoleListCreateAPIView(generics.ListCreateAPIView):
    queryset = Group.objects.all().order_by("name")
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdministrator]


class RoleRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Group.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdministrator]


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


class UserRoleListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdministrator]

    def get(self, request, user_id):
        user = generics.get_object_or_404(User, id=user_id)
        return Response({"user_id": user.id, "roles": user.role_names, "timestamp": timezone.now().isoformat()})
