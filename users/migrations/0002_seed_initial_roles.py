from django.db import migrations


ROLE_NAMES = [
    "Administrator",
    "Chief",
    "Captain",
    "Sergeant",
    "Detective",
    "PoliceOfficer",
    "PatrolOfficer",
    "Cadet",
    "Complainant",
    "Witness",
    "Suspect",
    "Criminal",
    "Judge",
    "Coroner",
    "BaseUser",
]


def create_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for role_name in ROLE_NAMES:
        Group.objects.get_or_create(name=role_name)


def delete_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=ROLE_NAMES).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0001_initial"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(create_roles, delete_roles),
    ]
