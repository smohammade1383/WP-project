from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q

User = get_user_model()


class MultiIdentifierAuthBackend(ModelBackend):
    """Authenticate with username, email, phone number, or national ID."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        identifier = username or kwargs.get(User.USERNAME_FIELD)
        if not identifier or not password:
            return None

        try:
            user = User.objects.get(
                Q(username=identifier)
                | Q(email__iexact=identifier)
                | Q(phone_number=identifier)
                | Q(national_id=identifier)
            )
        except User.DoesNotExist:
            return None
        except User.MultipleObjectsReturned:
            # Should not happen due to unique constraints, but keep auth deterministic.
            user = User.objects.filter(email__iexact=identifier).first()

        if user and user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
