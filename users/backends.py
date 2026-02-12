from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q

User = get_user_model()

from .utils import normalize_digits


class MultiIdentifierAuthBackend(ModelBackend):
    """Authenticate with username, email, phone number, or national ID."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        identifier = username or kwargs.get(User.USERNAME_FIELD)
        if not identifier or not password:
            return None

        identifier = str(identifier).strip()
        normalized_identifier = normalize_digits(identifier).strip()
        identifiers = {identifier, normalized_identifier}

        try:
            user = User.objects.get(
                Q(username__in=identifiers)
                | Q(email__iexact=identifier)
                | Q(phone_number__in=identifiers)
                | Q(national_id__in=identifiers)
            )
        except User.DoesNotExist:
            return None
        except User.MultipleObjectsReturned:
            # Should not happen due to unique constraints, but keep auth deterministic.
            user = User.objects.filter(email__iexact=identifier).first()

        if user and user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
