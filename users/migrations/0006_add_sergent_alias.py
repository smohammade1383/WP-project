from django.db import migrations


def ensure_sergeant_role(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    RoleProfile = apps.get_model("users", "RoleProfile")
    group, _ = Group.objects.get_or_create(name="Sergeant")
    RoleProfile.objects.get_or_create(group=group)


def remove_sergeant_role(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name="Sergeant").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0005_seed_role_profiles"),
    ]

    operations = [
        migrations.RunPython(ensure_sergeant_role, remove_sergeant_role),
    ]
