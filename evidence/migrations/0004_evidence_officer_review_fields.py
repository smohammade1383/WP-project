# Generated manually to keep DB/schema compatible across old and fresh local databases.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def _has_column(schema_editor, table_name, column_name):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        columns = connection.introspection.get_table_description(cursor, table_name)
    return any(col.name == column_name for col in columns)


def _add_missing_officer_review_columns(apps, schema_editor):
    evidence_table = apps.get_model("evidence", "Evidence")._meta.db_table
    qn = schema_editor.quote_name

    if not _has_column(schema_editor, evidence_table, "officer_review_status"):
        schema_editor.execute(
            f"ALTER TABLE {qn(evidence_table)} "
            f"ADD COLUMN {qn('officer_review_status')} varchar(20) NOT NULL DEFAULT 'pending'"
        )

    if not _has_column(schema_editor, evidence_table, "officer_review_message"):
        schema_editor.execute(
            f"ALTER TABLE {qn(evidence_table)} "
            f"ADD COLUMN {qn('officer_review_message')} text NOT NULL DEFAULT ''"
        )

    if not _has_column(schema_editor, evidence_table, "officer_reviewed_at"):
        schema_editor.execute(
            f"ALTER TABLE {qn(evidence_table)} "
            f"ADD COLUMN {qn('officer_reviewed_at')} datetime NULL"
        )

    if not _has_column(schema_editor, evidence_table, "officer_reviewer_id"):
        schema_editor.execute(
            f"ALTER TABLE {qn(evidence_table)} "
            f"ADD COLUMN {qn('officer_reviewer_id')} bigint NULL"
        )

    # Keep lookup performant even if historical DB had these columns without index.
    schema_editor.execute(
        f"CREATE INDEX IF NOT EXISTS {qn('evidence_evidence_officer_reviewer_id_idx')} "
        f"ON {qn(evidence_table)} ({qn('officer_reviewer_id')})"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("evidence", "0003_biomedicalevidence_validation_status_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(_add_missing_officer_review_columns, reverse_code=migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="evidence",
                    name="officer_review_message",
                    field=models.TextField(blank=True, default=""),
                ),
                migrations.AddField(
                    model_name="evidence",
                    name="officer_review_status",
                    field=models.CharField(
                        choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")],
                        default="pending",
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
            ],
        ),
    ]

