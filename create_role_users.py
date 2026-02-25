#!/usr/bin/env python
"""
Creates one user per role (all roles except Administrator).
Name/lastname/username = first 3 chars of role name.
Password: f13488431
"""
import os
import django
import random

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth.models import Group
from users.models import User

PASSWORD = "f13488431"

# role → 3-char prefix (first 3 chars of first word, lowercased)
ROLES = [
    ("Chief",          "chi"),
    ("Captain",        "cap"),
    ("Sergeant",       "ser"),
    ("Detective",      "det"),
    ("Police Officer", "pol"),
    ("Patrol Officer", "pat"),
    ("Cadet",          "cad"),
    ("Complainant",    "com"),
    ("Witness",        "wit"),
    ("Suspect",        "sus"),
    ("Criminal",       "cri"),
    ("Judge",          "jud"),
    ("Coroner",        "cor"),
    ("Basic User",     "bas"),
]

def random_national_id(existing: set) -> str:
    while True:
        nid = "".join([str(random.randint(0, 9)) for _ in range(10)])
        # avoid all-same-digit IDs which are invalid in real life but fine here
        if nid not in existing:
            existing.add(nid)
            return nid

def random_phone(existing: set) -> str:
    while True:
        phone = "09" + "".join([str(random.randint(0, 9)) for _ in range(9)])
        if phone not in existing:
            existing.add(phone)
            return phone

used_nids: set = set(User.objects.values_list("national_id", flat=True))
used_phones: set = set(User.objects.values_list("phone_number", flat=True))
used_emails: set = set(User.objects.values_list("email", flat=True))

print("=" * 60)
print("Creating role users...")
print("=" * 60)

created = []
skipped = []

for role_name, prefix in ROLES:
    username = prefix
    first_name = prefix
    last_name = prefix

    # make email unique if prefix collides
    base_email = f"{prefix}@test.com"
    email = base_email
    counter = 1
    while email in used_emails:
        email = f"{prefix}{counter}@test.com"
        counter += 1

    # skip if username already exists
    if User.objects.filter(username=username).exists():
        skipped.append((role_name, username))
        # still make sure the role is assigned
        try:
            user = User.objects.get(username=username)
            group, _ = Group.objects.get_or_create(name=role_name)
            user.groups.add(group)
        except Exception:
            pass
        continue

    national_id = random_national_id(used_nids)
    phone_number = random_phone(used_phones)
    used_emails.add(email)

    user = User.objects.create_user(
        username=username,
        password=PASSWORD,
        first_name=first_name,
        last_name=last_name,
        email=email,
        national_id=national_id,
        phone_number=phone_number,
    )

    group, _ = Group.objects.get_or_create(name=role_name)
    user.groups.add(group)

    created.append({
        "role": role_name,
        "username": username,
        "email": email,
        "national_id": national_id,
        "phone_number": phone_number,
    })

print(f"\n✅ Created {len(created)} user(s):\n")
print(f"{'Role':<18} {'Username':<10} {'Email':<22} {'National ID':<12} {'Phone'}")
print("-" * 80)
for u in created:
    print(f"{u['role']:<18} {u['username']:<10} {u['email']:<22} {u['national_id']:<12} {u['phone_number']}")

if skipped:
    print(f"\n⚠️  Skipped {len(skipped)} already-existing user(s): {[s[1] for s in skipped]}")

print("\n🔑 Password for all users: f13488431")
print("=" * 60)
