from django.conf import settings
from django.db import models


class Trial(models.Model):
    class Verdict(models.TextChoices):
        INNOCENT = "innocent", "Innocent"
        GUILTY = "guilty", "Guilty"

    case = models.OneToOneField("cases.Case", on_delete=models.CASCADE, related_name="trial")
    judge = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    verdict = models.CharField(max_length=20, choices=Verdict.choices)
    verdict_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Punishment(models.Model):
    trial = models.OneToOneField(Trial, on_delete=models.CASCADE, related_name="punishment")
    title = models.CharField(max_length=200)
    description = models.TextField()
