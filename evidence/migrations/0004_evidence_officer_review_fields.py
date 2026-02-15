from django.conf import settings
from django.db import migrations, models
from django.db.models import F
import django.db.models.deletion


def mark_existing_evidence_as_approved(apps, schema_editor):
    Evidence = apps.get_model("evidence", "Evidence")
    Evidence.objects.filter(officer_review_status="pending").update(
        officer_review_status="approved",
        officer_reviewed_at=F("created_at"),
        officer_review_message="Migrated existing evidence as approved.",
    )


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("evidence", "0003_biomedicalevidence_validation_status_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="evidence",
            name="officer_review_message",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="evidence",
            name="officer_review_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending Officer Review"),
                    ("approved", "Approved By Officer"),
                    ("rejected", "Rejected By Officer"),
                ],
                db_index=True,
                default="approved",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="evidence",
            name="officer_reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="evidence",
            name="officer_reviewer",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="officer_reviewed_evidences",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(mark_existing_evidence_as_approved, noop_reverse),
    ]
