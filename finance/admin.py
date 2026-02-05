from django.contrib import admin

from .models import PaymentTransaction, RewardReport

admin.site.register(RewardReport)
admin.site.register(PaymentTransaction)
