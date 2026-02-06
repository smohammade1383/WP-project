# WP-project Backend

Django REST backend for the police automation project.

## Tech Stack
- Django 6.0
- Django REST Framework
- drf-spectacular (OpenAPI/Swagger)
- PostgreSQL (Docker) or SQLite (local)

## Run Locally
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

## Docker Run
```bash
docker compose up --build
```

## API Docs
- Swagger UI: `http://127.0.0.1:8000/api/docs/`
- OpenAPI schema: `http://127.0.0.1:8000/api/schema/`

## Main API Groups
- `api/users/*`: signup, login/logout, profile, RBAC role management
- `api/cases/*`: complaint/case flows, crime-scene flow, board, interrogation, wanted, stats
- `api/evidence/*`: evidence CRUD and typed evidence details
- `api/finance/*`: reward flow, payment initiation/callback/return
- `api/judiciary/*`: trial registration and comprehensive case report

## Tests
```bash
python manage.py test
```

Current backend test suite includes flow/permission/payment/reward coverage in `cases` and `finance` apps.
