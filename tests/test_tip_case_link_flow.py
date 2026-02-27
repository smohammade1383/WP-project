from datetime import timedelta

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.models import Case, SuspectCaseProfile
from evidence.models import Evidence
from users.models import User


class TipCaseLinkFlowTests(APITestCase):
    pass
