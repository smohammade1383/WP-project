from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from cases.models import Case, SuspectCaseProfile

User = get_user_model()

DEFAULT_PASSWORD = "SeedPass1234"

SAMPLE_SUSPECTS = [
    {
        "username": "wanted_1",
        "first_name": "Kourosh",
        "last_name": "Azadi",
        "national_id": "0011111111",
        "phone_number": "09100000001",
        "email": "wanted1@example.com",
        "severity": Case.Severity.CRITICAL,
        "wanted_days": 60,
        "public_details": "Wanted for multiple violent incidents. Considered armed.",
        "public_photo": "https://picsum.photos/seed/wanted1/300/300",
    },
    {
        "username": "wanted_2",
        "first_name": "Mina",
        "last_name": "Karimi",
        "national_id": "0011111112",
        "phone_number": "09100000002",
        "email": "wanted2@example.com",
        "severity": Case.Severity.LEVEL_1,
        "wanted_days": 45,
        "public_details": "Suspected in organized fraud cases. High priority.",
        "public_photo": "https://picsum.photos/seed/wanted2/300/300",
    },
    {
        "username": "wanted_3",
        "first_name": "Arash",
        "last_name": "Nouri",
        "national_id": "0011111113",
        "phone_number": "09100000003",
        "email": "wanted3@example.com",
        "severity": Case.Severity.LEVEL_2,
        "wanted_days": 38,
        "public_details": "Suspected in repeated burglary cases.",
        "public_photo": "https://picsum.photos/seed/wanted3/300/300",
    },
]


class Command(BaseCommand):
    help = "Seed sample severe-tracking suspects for the Most Wanted page."

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=3,
            help="Number of sample suspects to create (max: 3).",
        )

    def handle(self, *args, **options):
        count = max(1, min(options["count"], len(SAMPLE_SUSPECTS)))

        officer = self._get_or_create_user(
            username="seed_officer",
            first_name="Seed",
            last_name="Officer",
            national_id="0099999999",
            phone_number="09100000000",
            email="seed.officer@example.com",
        )

        created_profiles = 0

        for sample in SAMPLE_SUSPECTS[:count]:
            suspect = self._get_or_create_user(
                username=sample["username"],
                first_name=sample["first_name"],
                last_name=sample["last_name"],
                national_id=sample["national_id"],
                phone_number=sample["phone_number"],
                email=sample["email"],
            )

            case_title = f"Seed Case - {sample['username']}"
            case, _ = Case.objects.get_or_create(
                title=case_title,
                defaults={
                    "description": "Seeded case for Most Wanted demo.",
                    "location": "Tehran",
                    "incident_datetime": timezone.now() - timedelta(days=sample["wanted_days"] + 5),
                    "source_type": Case.SourceType.CRIME_SCENE,
                    "status": Case.Status.OPEN,
                    "severity": sample["severity"],
                    "created_by": officer,
                },
            )

            profile, was_created = SuspectCaseProfile.objects.get_or_create(
                case=case,
                suspect=suspect,
            )

            profile.public_details = sample["public_details"]
            profile.public_photo = sample["public_photo"]
            profile.is_arrested = False
            profile.arrest_warrant_issued = True
            profile.wanted_since = timezone.now() - timedelta(days=sample["wanted_days"])
            profile.save()

            if was_created:
                created_profiles += 1

        self.stdout.write(self.style.SUCCESS("Most Wanted seed completed."))
        self.stdout.write(f"Created profiles: {created_profiles}")
        self.stdout.write("Seed login password for created users:")
        self.stdout.write(f"  {DEFAULT_PASSWORD}")

    def _get_or_create_user(self, **fields):
        username = fields["username"]
        user, created = User.objects.get_or_create(username=username, defaults=fields)

        if created:
            user.set_password(DEFAULT_PASSWORD)
            user.save()
            return user

        update_fields = []
        for key, value in fields.items():
            if getattr(user, key) != value:
                setattr(user, key, value)
                update_fields.append(key)

        if update_fields:
            user.save(update_fields=update_fields)

        return user
