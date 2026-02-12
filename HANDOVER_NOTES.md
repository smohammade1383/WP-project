# Handover Notes

## Scope Status
This file summarizes what is complete in core police/judiciary flows and what remains for finance-focused teammate work.

## Completed Core Features
### Backend
- Dynamic RBAC with assignable/removable roles.
- Multi-identifier auth (username/email/phone/national_id) and profile endpoints.
- Complaint flow:
  - Citizen submission.
  - Cadet review (approve/return with message).
  - Officer review (approve/reject, case creation on approve).
  - Three-strikes complaint void handling.
- Crime-scene case registration flow.
- Evidence subsystem with typed evidence:
  - Witness/transcription/media.
  - Bio-medical evidence with coroner review workflow.
  - Vehicle evidence constraint checks.
  - Identity key-value evidence.
  - Other evidence.
- Detective board workflow:
  - Board state save/load.
  - Node/link management.
  - Suspect nomination and handoff to Sergeant.
- Sergeant/Captain/Chief workflow:
  - Arrest and interrogation scoring chain.
  - Captain decision (prosecute/escalate/reject).
  - Chief gate for critical cases.
- Judge/trial workflow:
  - Case dossier/report retrieval.
  - Final verdict registration and case closure.
- Wanted + severe-tracking + tip/reward pipeline endpoints.
- Aggregated stats endpoint(s).

### Frontend
- Role-based modular dashboard implementation for:
  - Citizen, Cadet, Officer, Detective, Sergeant, Captain, Chief, Coroner, Judge, Admin.
- Detective board UI with evidence linking and detailed case handling.
- Coroner lab validation UI for bio-medical evidence.
- Captain/Chief/Judge dossier and decision screens.
- Wanted/severe-tracking public-facing module and reward-related role views.
- Generic route hardening:
  - `/cases`, `/complaints`, `/evidence`, `/finance`, `/rewards`, `/trials` now act as role-aware redirect hubs.
  - Dedicated `/403` forbidden page implemented for unauthorized access.

### Quality/Verification
- Backend integration suites present in `/Users/apple/Documents/GitHub/WP-project/tests`.
- Frontend Vitest suites present in `/Users/apple/Documents/GitHub/WP-project/frontend/src`.
- Docker Compose stack verified (db + web + frontend) and test commands run in container.

## Pending Finance Integrations (Teammate Focus)
The following items are the main remaining finance-heavy scope:

1. Real payment gateway integration
- Replace/mock/demo payment logic with production-style provider integration.
- Ensure secure callback verification/signature checks.
- Harden return/callback error handling and idempotency.

2. Bail and penalty settlement hardening
- Finalize end-to-end legal payment UX for eligible suspects/criminals.
- Validate policy restrictions by crime level and status at payment time.
- Add reconciliation and audit logs for settlement events.

3. Reward payout operationalization
- Keep current reward-code generation flow, then add actual payout settlement path.
- Add officer-facing verification and payout completion state tracking (if required by team process).

4. Documentation and acceptance artifacts for finance
- Update Swagger examples for finance endpoints with final provider payloads.
- Add teammate-owned test cases specifically for gateway success/failure/timeouts/retries.

## Suggested Ownership Split
- Teammate A (Finance): gateway + callbacks + settlement states + finance tests.
- Teammate B (Stability): expanded regression tests + CI checks + edge-case hardening.
- Teammate C (UI Polish): final UX/error/loading states for finance/reward screens.

## Quick Runbook
```bash
cd /Users/apple/Documents/GitHub/WP-project
docker compose up --build -d
docker compose exec -T web python manage.py test tests -v 1
docker compose exec -T frontend npm test
```

## Risks to Watch
- Role naming variations (`Sergeant` vs `Sergent`) across old/new data.
- Gateway callback race conditions and duplicate callback handling.
- Cross-role permission regressions after finance route/controller updates.
