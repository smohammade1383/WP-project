from django.urls import path

from .views import (
    ChangePasswordAPIView,
    CSRFTokenAPIView,
    LoginAPIView,
    LogoutAPIView,
    ProfileAPIView,
    RoleListCreateAPIView,
    RoleRetrieveUpdateDestroyAPIView,
    SignupAPIView,
    UserRoleListAPIView,
    UserRoleManagementAPIView,
)

urlpatterns = [
    path("auth/csrf/", CSRFTokenAPIView.as_view(), name="csrf-token"),
    path("auth/signup/", SignupAPIView.as_view(), name="signup"),
    path("auth/login/", LoginAPIView.as_view(), name="login"),
    path("auth/logout/", LogoutAPIView.as_view(), name="logout"),
    path("auth/profile/", ProfileAPIView.as_view(), name="profile"),
    path("auth/change-password/", ChangePasswordAPIView.as_view(), name="change-password"),
    path("rbac/roles/", RoleListCreateAPIView.as_view(), name="role-list-create"),
    path("rbac/roles/<int:pk>/", RoleRetrieveUpdateDestroyAPIView.as_view(), name="role-rud"),
    path("rbac/users/<int:user_id>/roles/", UserRoleManagementAPIView.as_view(), name="user-role-manage"),
    path("rbac/users/<int:user_id>/roles/list/", UserRoleListAPIView.as_view(), name="user-role-list"),
]
