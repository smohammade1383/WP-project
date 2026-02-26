from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/users/", include("users.urls")),
    path("api/cases/", include("cases.urls")),
    path("api/evidence/", include("evidence.urls")),
    path("api/finance/", include("finance.urls")),
    path("api/judiciary/", include("judiciary.urls")),
    path("api/people/", include("people.urls")),
]

# Serve uploaded media files in local development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
