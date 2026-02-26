from django.db import migrations, models


def add_boardlink_points_if_missing(apps, schema_editor):
    table_name = "cases_boardlink"
    connection = schema_editor.connection

    with connection.cursor() as cursor:
        existing_columns = {
            column.name for column in connection.introspection.get_table_description(cursor, table_name)
        }

    statements = []
    if "from_point" not in existing_columns:
        statements.append(
            "ALTER TABLE cases_boardlink ADD COLUMN from_point varchar(10) NOT NULL DEFAULT 'center'"
        )
    if "to_point" not in existing_columns:
        statements.append(
            "ALTER TABLE cases_boardlink ADD COLUMN to_point varchar(10) NOT NULL DEFAULT 'center'"
        )

    if not statements:
        return

    with connection.cursor() as cursor:
        for statement in statements:
            cursor.execute(statement)


def noop_reverse(apps, schema_editor):
    # Keep existing data/columns intact on reverse to avoid destructive schema ops.
    return


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0011_case_assigned_sergeant"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(add_boardlink_points_if_missing, reverse_code=noop_reverse),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="boardlink",
                    name="from_point",
                    field=models.CharField(
                        choices=[
                            ("top", "Top"),
                            ("right", "Right"),
                            ("bottom", "Bottom"),
                            ("left", "Left"),
                            ("center", "Center"),
                        ],
                        default="center",
                        max_length=10,
                    ),
                ),
                migrations.AddField(
                    model_name="boardlink",
                    name="to_point",
                    field=models.CharField(
                        choices=[
                            ("top", "Top"),
                            ("right", "Right"),
                            ("bottom", "Bottom"),
                            ("left", "Left"),
                            ("center", "Center"),
                        ],
                        default="center",
                        max_length=10,
                    ),
                ),
            ],
        ),
    ]
