from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

from users.constants import INITIAL_ROLES


class Command(BaseCommand):
    help = "Seed initial roles into auth_group."

    def handle(self, *args, **options):
        created = []
        existing = []
        for role_name in INITIAL_ROLES:
            group, was_created = Group.objects.get_or_create(name=role_name)
            if was_created:
                created.append(group.name)
            else:
                existing.append(group.name)

        if created:
            self.stdout.write(self.style.SUCCESS(f"Created roles: {', '.join(created)}"))
        if existing:
            self.stdout.write(f"Existing roles: {', '.join(existing)}")
