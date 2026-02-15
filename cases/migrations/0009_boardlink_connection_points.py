from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0008_alter_case_status_complaintattachment"),
    ]

    operations = [
        migrations.AddField(
            model_name="boardlink",
            name="from_point",
            field=models.CharField(
                choices=[("top", "Top"), ("right", "Right"), ("bottom", "Bottom"), ("left", "Left")],
                default="right",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="boardlink",
            name="to_point",
            field=models.CharField(
                choices=[("top", "Top"), ("right", "Right"), ("bottom", "Bottom"), ("left", "Left")],
                default="left",
                max_length=10,
            ),
        ),
    ]
