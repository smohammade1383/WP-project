# WP-Project (Police Case Management)

Full-stack web system for complaint intake, case lifecycle management, evidence handling, role-based workflows, judiciary handoff, and wanted/reward flows.

## Stack
- Backend: Django 5.1 + Django REST Framework
- Frontend: React + Vite + TypeScript
- Database: PostgreSQL (Docker) or SQLite (local dev fallback)
- API Docs: drf-spectacular (Swagger/OpenAPI)

## Repository Structure
- `/Users/apple/Documents/GitHub/WP-project/users`: auth + dynamic roles (RBAC)
- `/Users/apple/Documents/GitHub/WP-project/cases`: complaint/case flow, detective board flow, approvals
- `/Users/apple/Documents/GitHub/WP-project/evidence`: typed evidence records + coroner verification
- `/Users/apple/Documents/GitHub/WP-project/people`: wanted ranking + citizen tips/reward flow
- `/Users/apple/Documents/GitHub/WP-project/judiciary`: trial + case dossier/report APIs
- `/Users/apple/Documents/GitHub/WP-project/finance`: payment/reward/bail-related endpoints
- `/Users/apple/Documents/GitHub/WP-project/frontend`: role-based dashboards and workflow UI
- `/Users/apple/Documents/GitHub/WP-project/tests`: integration/regression flow tests

## Architecture Summary
1. Intake pipeline: Citizen complaint -> Cadet review -> Officer final approval -> Case creation.
2. Investigation: Detective manages evidence + board graph, nominates suspects to Sergeant.
3. Command chain: Sergeant -> Captain -> Chief (critical-only) -> Judge.
4. Judiciary: Judge receives complete dossier and records final verdict/punishment.
5. Wanted/Reward: suspects tracked with ranking and citizen tips routed Officer -> Detective.

## Local Development Setup
### 1) Backend
```bash
cd /Users/apple/Documents/GitHub/WP-project
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

### 2) Frontend
```bash
cd /Users/apple/Documents/GitHub/WP-project/frontend
npm install
npm run dev
```

### Optional single-command local start
```bash
cd /Users/apple/Documents/GitHub/WP-project
./start-local.sh
```

## Docker Setup
```bash
cd /Users/apple/Documents/GitHub/WP-project
docker compose up --build -d
docker compose ps
```

To stop:
```bash
docker compose down --remove-orphans
```

## URLs
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/api/docs/`
- OpenAPI schema: `http://localhost:8000/api/schema/`

## Superuser (Django Admin)
```bash
cd /Users/apple/Documents/GitHub/WP-project
source .venv/bin/activate
python manage.py createsuperuser
```

Docker:
```bash
cd /Users/apple/Documents/GitHub/WP-project
docker compose exec web python manage.py createsuperuser
```

## Test Commands
### Backend
```bash
cd /Users/apple/Documents/GitHub/WP-project
source .venv/bin/activate
python manage.py test tests -v 1
```

### Frontend
```bash
cd /Users/apple/Documents/GitHub/WP-project/frontend
npm test
```

### Docker (both)
```bash
cd /Users/apple/Documents/GitHub/WP-project
docker compose exec -T web python manage.py test tests -v 1
docker compose exec -T frontend npm test
```

## Main API Domains
- `/api/users/*`: signup/login/logout/profile + role CRUD and assignment
- `/api/cases/*`: complaint intake, case lifecycle, board state, suspect progression
- `/api/evidence/*`: evidence create/list/update + coroner verification
- `/api/people/*`: wanted/severe tracking + citizen tips + stats
- `/api/judiciary/*`: reports and trial endpoints
- `/api/finance/*`: payment/reward/bail-related endpoints

## Notes
- Role names are dynamic; admin can create custom roles without code change.
- The frontend includes role-aware route hubs (`/cases`, `/complaints`, `/evidence`, `/finance`, `/rewards`, `/trials`) and a dedicated `/403` access-denied route.
