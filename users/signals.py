from django.contrib.auth.models import Group
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import RoleProfile


@receiver(post_save, sender=Group)
def ensure_role_profile(sender, instance, created, **kwargs):
    if created:
        RoleProfile.objects.get_or_create(group=instance)
