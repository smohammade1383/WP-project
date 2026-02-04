from django.contrib import admin

from .models import Punishment, Trial

admin.site.register(Trial)
admin.site.register(Punishment)
