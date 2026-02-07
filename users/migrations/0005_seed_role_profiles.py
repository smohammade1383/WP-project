from django.db import migrations


def seed_profiles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    RoleProfile = apps.get_model("users", "RoleProfile")
    for group in Group.objects.all():
        RoleProfile.objects.get_or_create(group=group)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0004_roleprofile"),
    ]

    operations = [
        migrations.RunPython(seed_profiles, noop_reverse),
    ]
