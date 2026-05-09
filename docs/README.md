# senior-app-1


## 1. Project Requirements

## User Roles

### Student
Students register to the system and work in project groups. They submit project documents and participate in sprints.

### Team Leader
The student who creates a group becomes the team leader. The team leader can invite other students to the group.

### Advisor
Advisors are professors who supervise project groups and evaluate their work.

### Coordinator
The coordinator manages grading rules, schedules, and committee assignments.

### Admin
The admin manages the system and performs administrative operations.

---

## 2. Functional Requirements

* Students must be able to register to the system.
* Students must be able to log in to the system.
* Groups must be able to submit a **Proposal document**.
* Groups must be able to submit a **Statement of Work (SoW)**.
* The system must fetch **sprint issues** from JIRA.
* The system must check related **GitHub pull requests** for those issues.
* The coordinator can configure deliverables, grading rubrics, and evaluation criteria.
* The system supports both binary and soft grading schemes.
* The coordinator can assign committees and manage jury assignments.
* The coordinator can set per-sprint story point requirements for each student.
* The system supports markdown editing with WYSIWYG support and image insertion for deliverable documents.
* The system provides an admin-generated, one-time-use password reset mechanism for registered users.
* The system allows professors to be manually registered by the admin, with a forced password change on first login.
* The system supports notification features for group invitations, advisor requests, and committee assignments.
* The coordinator can upload valid student IDs for registration eligibility.
* The coordinator can manually add or remove students from groups.
* The system supports daily refresh of JIRA issues and GitHub PRs for active sprints.
* The system provides live grade visibility for advisors during sprints.
* The system uses AI (Anthropic Claude) to read pull request comments and verify that a code review actually took place. Result (`REVIEWED` / `NOT_REVIEWED`) is stored on each `SprintPullRequest` and feeds into the Team Evaluation grading aggregation. Trigger via `POST /api/v1/teams/{teamId}/sprints/{sprintId}/pr-review-verifications`.
* The system uses AI (Anthropic Claude) to validate issue implementation by comparing the JIRA issue description against PR file diffs (Business Flows 13, 14, 15 in `docs/api_sprint_monitoring.yaml`). Stores `MATCHED` / `PARTIAL_MATCH` / `NOT_MATCHED` per issue. Trigger via `POST /api/v1/teams/{teamId}/sprints/{sprintId}/ai-validations`.
* Both AI features degrade gracefully to `AI_UNAVAILABLE` when `ANTHROPIC_API_KEY` is not configured — they never block grade submission or sprint evaluation.

---

## 3. Non-Functional Requirements

* The system must support at least 500 concurrent users without performance degradation.
* The system should respond to user actions within 2 seconds for 95% of requests.
* User data must be stored securely.
* The system should keep logs of all user activities, with logs retained for a minimum of 1 year and accessible only to authorized personnel.
* The system must have an uptime of at least 99.5% per month, excluding scheduled maintenance.
* The system must be accessible and usable on the latest versions of Chrome, Firefox, Safari, and Edge, and on both desktop and mobile devices.
* All user-facing pages must meet WCAG 2.1 AA accessibility standards.
* The system must support daily automated backups, with the ability to restore data within 4 hours in case of failure.
* All critical actions (e.g., grading, group changes, deliverable submissions) must be auditable, with a full history available to admins and coordinators.
* The system must be designed for maintainability, with modular code and clear documentation to allow onboarding of new developers within 2 weeks.
* Privacy: All personal data must comply with GDPR or equivalent privacy standards, including the right to data deletion and export.
* The system supports horizontal scaling to support increased user load during peak periods (e.g., submission deadlines).

---

## 4. Integration Requirements

* The system must support **GitHub OAuth** authentication for students to connect their GitHub accounts and fetch usernames for integration purposes.
* The system must integrate with **GitHub** to access pull requests, fetch branches, and verify PR merges.
* The system must integrate with **JIRA** to track sprint issues, story points, and fetch active stories in a sprint.
* The team leader must be able to connect the group with a **GitHub organization**.
* The team leader must be able to connect the group with a **JIRA workspace**.
* The team leader can set up and manage JIRA and GitHub integrations for their group.


## System Process Overview
| PROCESS | DESCRIPTION | SYSTEM COMPONENTS INVOLVED |
| :--- | :--- | :--- |
| User Registration | Students register via ID and link GitHub via OAuth. | Frontend, Auth Service (NextAuth.js), Database |
| Group Formation | Students create groups, invite members, and request advisors. | Frontend, Notification Service, Group DB |
| Mentor Matching | Managing "Advisee Requests" from team leaders to professors, including approval, release, or group transfer by the coordinator. | Team Leader, Advisor, Coordinator UI, Notification Service. |
| Deliverable Management | Coordinator sets rubrics; groups submit Proposal and SoW documents. | Frontend, Backend, Document Storage, Grading DB |
| Sprint Monitoring | System daily refreshes JIRA/GitHub data to track active stories and PRs. | JIRA/GitHub API Integrations, Backend, Sync Service |
| Final Evaluation | System applies scalars to deliverable grades based on individual contribution. | Backend (Logic Engine), Database, Advisor Panel |

---

## Detailed Workflow Steps

### 1. User Registration
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Student registers with ID | Frontend + Backend | Student ID (Pre-verified by Coordinator) |
| Student connects GitHub | Frontend + NextAuth.js | GitHub OAuth Tokens, Username |
| Admin registers as Professor | Admin Panel + Backend | Professor Name, Email |
| Professor changes password | Frontend + Backend | One-time reset link, New Password |
| Admin generates password reset link | Admin Panel + Backend | Target user ID, Admin JWT |
| User resets password | Frontend + Backend | One-time reset token, New password |

#### Password Reset Flow

Admins can generate a one-time password reset link for any registered user from the admin workspace.

Backend endpoints:

| METHOD | ENDPOINT | AUTHORIZATION | PURPOSE |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/admin/users/{userId}/password-reset-link` | Admin only | Generate a reset link for the target user |
| POST | `/api/v1/auth/reset-password` | Public token-based | Set a new password using a valid reset token |

Frontend routes:

| ROUTE | PURPOSE |
| :--- | :--- |
| `/admin/password-reset-links` | Admin tool for generating password reset links |
| `/reset-password?token=...` | Public reset form for setting a new password |

Security behavior:

* Reset tokens are generated with crypto-secure randomness.
* Plain reset tokens are never stored in the database; only token hashes are stored.
* Generating a new reset link invalidates older active reset links for the same user.
* Reset tokens expire after a configurable lifetime.
* Token consume, password update, session-version update, and sibling-token invalidation happen in one transaction.
* Previously issued JWT sessions for the reset user are invalidated by incrementing the user's session version.
* Frontend login clears stale role-specific sessions from local storage before saving the new session.

Configuration:

| ENV VARIABLE | DEFAULT | PURPOSE |
| :--- | :--- | :--- |
| `FRONTEND_URL` | `http://localhost:5173` | Base URL used when building reset links |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | `60` | Reset token lifetime in minutes |

Targeted checks:

```bash
# backend password reset flow
cd backend
JWT_SECRET=test-backend-jwt-not-for-production node --test --test-concurrency=1 test/passwordReset.test.js

# frontend stale-session/login regression
cd frontend
npm test -- issue315-LoginPage.test.jsx

# frontend production build
cd frontend
npm run build
```

### 2. Group Formation
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Student creates a group | Frontend + Backend | Group Name, Team Leader ID |
| Leader invites members | Frontend + Notifications | Student IDs |
| Members approve/deny | Frontend + Notifications | Approval status |
| Coordinator manually edits group | Coordinator Panel | Student ID, Add/Remove action |

### 3. Mentor Matching
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Team Leader makes Advisee Request | Frontend + Notifications | Selected Professor ID |
| Team Leader withdraws request | Frontend + Backend | Request ID |
| Advisor receives notification | Advisor Panel + Notifications | Requesting Group details |
| Advisor approves/rejects request | Advisor Panel + Notifications | Approval/Rejection status |
| Advisor releases team | Advisor Panel + Notifications | Release confirmation for new requests |
| Coordinator transfers group | Coordinator Panel + Notifications | New Advisor ID |
| System performs sanitization | Backend | Groups without an advisor (disbanded) |

### 4. Deliverable Management
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Coordinator creates rubric | Frontend + Backend | Questions, Binary/Soft criteria |
| Coordinator sets weights | Frontend + Backend | Deliverable %, Sprint associations |
| Coordinator assigns committee | Coordinator Panel | Committee ID, Group IDs |
| Group submits Proposal/SoW | Markdown Editor | Text document, Images, Metadata |
| Committee reviews submission | Frontend + Backend | Comments, Grading picker |

### 5. Sprint Monitoring
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Team binds JIRA/GitHub | Frontend + Integration | JIRA Workspace, GitHub Org PAT |
| Daily refresh of stories | Backend + JIRA API | Issue Key, Work, Assignee, Points |
| Verify PR and merges | Backend + GitHub API | Issue Key, Branch name, PR status |
| AI validates implementation | AI Service + GitHub | File diffs, Issue description |

### 6. Final Evaluation
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Advisor grades Scrum/Review | Advisor Panel | Soft Grading letters (A, B, C...) |
| System calculates Team Scalar | Backend (Logic) | Avg of Scrum and Code Reviews |
| Track Individual points | Backend + JIRA | Completed vs Target story points |
| Apply final grade scalars | Backend + Database | Team grade, Individual ratio |

---

## 5. Quick start

```bash
# Backend
cd backend
npm install
cp .env.example .env          # already populated with shared dev keys
node seed.js --reset          # creates tables + demo data on Supabase
npm run dev                   # http://localhost:3001

# Frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Demo accounts and the shared password live in [`PASSWORDS.md`](PASSWORDS.md).
Full requirements catalogue in [`REQUIREMENTS.md`](REQUIREMENTS.md).

---

## 6. Database (Supabase)

`backend/db.js` resolves the dialect from env:

- `DATABASE_URL` set → connects to Postgres (Supabase).
- Otherwise → local `database.sqlite`.

The committed `backend/.env.example` points at the team's shared Supabase project:

```
DATABASE_URL=postgresql://postgres:<password>@db.kkvdarceomdqzeqiacfo.supabase.co:5432/postgres
SUPABASE_URL=https://kkvdarceomdqzeqiacfo.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

Run `node seed.js --reset` to drop & recreate every table on Supabase and load
the demo dataset (`--reset` is destructive; omit it for additive seeding).
Rotate the database password and the `sb_*` keys in the Supabase dashboard
before going to production and update `.env.example`.

---

## 7. Worked grading example (from the brief)

Two grading styles per rubric criterion:

- **Binary** — `S` = 100, `F` = 0.
- **Soft** — `A` = 100, `B` = 80, `C` = 60, `D` = 50, `F` = 0.

| Activity | Sprint 1 | Sprint 2 | Sprint 3 | Avg |
| --- | --- | --- | --- | --- |
| Scrum | B | A | A | 90 |
| Work / Code Review | C | B | A | 70 |

Presumed deliverable grades: Proposal 90, SoW 94, Demonstration 92.

Sprint → deliverable contribution scalars (set by Coordinator):

| | Proposal | SoW | Demonstration |
| --- | --- | --- | --- |
| Scrum (sprints contributing) | 1 → 0.7 | 1, 2 → 0.9 | 1, 2, 3 → 0.93 |
| Reviews | → 0.6 | → 0.7 | → 0.8 |
| AVG(Scrum, Reviews) | 0.65 | 0.8 | 0.865 |

After scalars: `90 × 0.65 = 58.5`, `94 × 0.8 = 75.2`, `92 × 0.865 = 79.58`.

Item / deliverable weights:

| Documents (50 %) | Demonstration (50 %) | Total |
| --- | --- | --- |
| Proposal × 0.15 + SoW × 0.35 = 8.77 + 26.32 | 79.58 × 0.5 = 74.55 | **74.88** |

Story-point completion ratios slice the team grade per member.
Example: student `11070001000` completes 5/5 in Sprint 1, 4/5 in Sprint 2 →
ratio 0.9 → individual grade `74.88 × 0.9 = 71.62`.

---

## 8. Features and implementation status

| Capability | Status |
| --- | --- |
| Admin password reset link (Difficulty 1) | ✅ `passwordResetTokenService.js`, `ResetPasswordPage.jsx` |
| Logging user events (Difficulty 1) | ✅ `AuditLog` + fire-and-forget logging across grade submission, rubric updates, AI validation |
| Embedded Markdown Editor (Difficulty 2) | ✅ `SubmissionEditorPage.jsx` with `react-markdown` |
| AI to Read Pull Requests (Difficulty 3) — *issue #430* | ✅ `aiFeatureService.verifyPrReviewsForSprint`, panel on `SprintEvaluationPage` |
| AI to Validate Issue Implementation (Difficulty 4) — *issue #430* | ✅ Business Flows 13/14/15 wired |
| GitHub OAuth | ✅ Backend redirect + state model; frontend pickup in `Register.jsx` |
| JIRA / GitHub Integration | ✅ Daily refresh, snapshot, PR verification |

### AI features endpoint summary

- `POST /api/v1/teams/:teamId/sprints/:sprintId/pr-review-verifications`
- `GET  /api/v1/teams/:teamId/sprints/:sprintId/pr-review-verifications`
- `POST /api/v1/teams/:teamId/sprints/:sprintId/ai-validations` (Business Flow 13)
- `GET  /api/v1/teams/:teamId/sprints/:sprintId/ai-validations`
- `GET  /api/v1/teams/:teamId/sprints/:sprintId/ai-signals` — aggregate consumed by Team Evaluation grading
- `POST /internal/sprint-sync/ai-validations` — BF15 batch upsert (`x-internal-api-key`)
- `POST /internal/evaluations/validation-results` — BF14 forward (`x-internal-api-key`)

Both AI features degrade gracefully to `AI_UNAVAILABLE` when `ANTHROPIC_API_KEY`
is missing — the rest of the grading pipeline keeps working.

---

## 9. Tests

```bash
cd backend && npm test            # node:test suite
```

The Anthropic SDK is mocked in `test/issue430-ai-features.test.js` so tests
don't burn real API credits.

---

## 10. Repo layout

```
senior-app-1/
├── backend/
│   ├── controllers/    # HTTP handlers (express-validator + service calls)
│   ├── services/       # Business logic, talks to models
│   │   ├── aiService.js          # Anthropic SDK wrapper
│   │   ├── aiFeatureService.js   # AI orchestration (GitHub + AI + DB)
│   │   ├── finalEvaluationService.js
│   │   └── ...
│   ├── models/         # Sequelize models (incl. AIValidationResult, SprintPullRequest)
│   ├── routes/         # Express routers
│   ├── middleware/
│   ├── repositories/
│   ├── test/           # node:test integration tests
│   ├── seed.js         # Demo dataset loader
│   ├── db.js           # Sequelize bootstrap (Postgres / SQLite)
│   └── .env.example    # Committed shared dev keys
├── frontend/
│   └── src/
│       ├── components/AiFeaturesPanel.jsx
│       ├── services/{apiClient.js,aiFeatures.js,sprintMonitoring.js}
│       └── *Page.jsx
└── docs/
    ├── README.md            # This file — system requirements + setup
    ├── REQUIREMENTS.md      # Detailed requirement catalogue
    ├── PASSWORDS.md         # Demo accounts
    ├── CONTRIBUTING.md      # Branching / commit / PR / test rules
    ├── api_*.yaml           # OpenAPI specs per module
    └── dfd_*.drawio         # Data-flow diagrams
```

---

## 11. Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch naming, commit format, PR
template, and the backend/frontend implementation checklist (model → service →
controller → route → mount → test). Branches must be created from the GitHub
issue page, not by hand.
