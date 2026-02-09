#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from cases.models import Case
from users.models import User
from django.utils import timezone

# Get detective user
detective = User.objects.get(phone_number='09056460032')

# Create test case
case = Case.objects.create(
    title='Test Detective Board Case',
    description='This is a test case for the detective board functionality',
    location='Tehran, Iran',
    incident_datetime=timezone.now(),
    source_type=Case.SourceType.CRIME_SCENE,
    status=Case.Status.OPEN,
    severity=Case.Severity.LEVEL_2,
    created_by=detective
)

print('=' * 60)
print('✅ Case Created Successfully!')
print('=' * 60)
print(f'Case ID: {case.id}')
print(f'Title: {case.title}')
print(f'Status: {case.status}')
print(f'Created by: {detective.username}')
print()
print('🔗 Access Detective Board:')
print(f'http://localhost:5173/detective-board?caseId={case.id}')
print('=' * 60)
