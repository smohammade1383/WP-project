from django.db import migrations


def create_sergent_role(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    RoleProfile = apps.get_model("users", "RoleProfile")
    group, _ = Group.objects.get_or_create(name="Sergent")
    RoleProfile.objects.get_or_create(group=group)


def remove_sergent_role(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name="Sergent").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0005_seed_role_profiles"),
    ]

    operations = [
        migrations.RunPython(create_sergent_role, remove_sergent_role),
    ]
