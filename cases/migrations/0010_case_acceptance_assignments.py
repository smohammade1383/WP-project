from django.conf import settings
from django.db import migrations, models


def seed_existing_acceptance_assignments(apps, schema_editor):
    Case = apps.get_model("cases", "Case")
    DetectiveBoard = apps.get_model("cases", "DetectiveBoard")
    Trial = apps.get_model("judiciary", "Trial")

    for board in DetectiveBoard.objects.exclude(detective_id__isnull=True):
        Case.objects.filter(id=board.case_id, accepted_detective_id__isnull=True).update(
            accepted_detective_id=board.detective_id
        )

    seen_case_ids = set()
    for trial in Trial.objects.exclude(judge_id__isnull=True).order_by("case_id", "-created_at", "-id"):
        if trial.case_id in seen_case_ids:
            continue
        seen_case_ids.add(trial.case_id)
        Case.objects.filter(id=trial.case_id, accepted_judge_id__isnull=True).update(accepted_judge_id=trial.judge_id)


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("judiciary", "0002_trial_defendant_alter_trial_case_alter_trial_verdict"),
        ("cases", "0009_boardlink_connection_points"),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="accepted_detective",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="accepted_detective_cases",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="case",
            name="accepted_judge",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="accepted_judge_cases",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(seed_existing_acceptance_assignments, migrations.RunPython.noop),
    ]
