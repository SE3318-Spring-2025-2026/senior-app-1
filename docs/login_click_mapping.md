# Login and Registration Mapping (DFD-Aligned)

This version is intentionally short and algorithm-focused.

## Entry Routes

| Action | Route | API |
| --- | --- | --- |
| Student login | `/auth` (role: Student) | `POST /api/v1/students/login` |
| Professor login | `/auth` (role: Professor) | `POST /api/v1/professors/login` |
| Coordinator login | `/auth` (role: Coordinator) | `POST /api/v1/coordinator/login` |
| Admin login | `/auth` (role: Admin) | `POST /api/v1/admin/login` |
| Student sign up | `/auth` (Sign up tab) | `POST /api/v1/students/register` |
| Professor first password | `/professors/password-setup` | `POST /api/v1/professors/password-setup` |

All successful logins redirect to `/home`.

## Development Login Credentials

Use these credentials for local development.

| Role | Login Route | Username Field | Password |
| --- | --- | --- | --- |
| Admin | `/auth` (role: Admin) | `admin@example.com` | `AdminPass2026!` |
| Coordinator | `/auth` (role: Coordinator) | `coordinator@example.com` | `CoordinatorPass2026!` |

Student and Professor accounts are not fixed defaults:

- Student: register through `/auth` using a valid student ID (from `VALID_STUDENT_IDS` in backend `.env`).
- Professor: created by Admin, then sets initial password at `/professors/password-setup`.

If Admin/Coordinator login fails, reset them with:

1. `cd backend && node createAdmin.js`
2. `cd backend && node createCoordinator.js`

## Core Algorithm (Auth)

1. User selects role and submits credentials.
2. Frontend calls role-specific login API.
3. On success:
   - Store role token (`studentToken`, `professorToken`, `coordinatorToken`, `adminToken`).
   - Store `authToken`.
   - Store role user payload (`studentUser`, `professorUser`, etc.).
4. Redirect to `/home` and render role-specific actions.

## DFD 1.0-1.5 Mapping

| DFD Process | System Behavior | Implemented Status |
| --- | --- | --- |
| 1.0 Validate Student Registration | Check student eligibility by valid ID list before account creation | Implemented |
| 1.1 Create Student Account | Persist student account after validation | Implemented |
| 1.2 Link GitHub Account | OAuth callback + linked account persistence | Implemented |
| 1.3 Register Professor Account | Admin creates professor account | Implemented |
| 1.4 Set Initial Professor Password | One-time professor password setup flow | Implemented |
| 1.5 Upload Valid Student IDs | Coordinator imports valid IDs | Implemented |

## Requirement Fit Notes

- Matches role model in `docs/README.md`: Student, Team Leader, Advisor(Professor), Coordinator, Admin.
- Professor signup is not public: admin-created + first password setup only.
- Student registration is gated by coordinator-uploaded valid IDs.

## Current Gaps vs. README (Non-Auth)

Not part of this login algorithm and still broader roadmap items:

- Full 2FA enforcement.
- WCAG AA verification for all screens.
- Sprint/JIRA/GitHub advanced evaluation logic (future features).

## Dev Run Notes

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Open Vite URL (usually `http://localhost:5173`)
