from django.db import migrations


ROLE_NAMES = [
    "Administrator",
    "Chief",
    "Captain",
    "Sergeant",
    "Detective",
    "Police Officer",
    "Patrol Officer",
    "Cadet",
    "Complainant",
    "Witness",
    "Suspect",
    "Criminal",
    "Judge",
    "Coroner",
    "Basic User",
]

LEGACY_TO_NEW = {
    "PoliceOfficer": "Police Officer",
    "PatrolOfficer": "Patrol Officer",
    "BaseUser": "Basic User",
}


def normalize_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")

    for legacy, new_name in LEGACY_TO_NEW.items():
        group = Group.objects.filter(name=legacy).first()
        if group and not Group.objects.filter(name=new_name).exists():
            group.name = new_name
            group.save(update_fields=["name"])

    for role_name in ROLE_NAMES:
        Group.objects.get_or_create(name=role_name)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0002_seed_initial_roles"),
    ]

    operations = [
        migrations.RunPython(normalize_roles, noop_reverse),
    ]
