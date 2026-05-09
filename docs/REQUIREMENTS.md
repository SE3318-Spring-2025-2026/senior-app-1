# Requirements — Senior Project Management System

This document is the authoritative requirements list for the senior-app-1
platform. It mirrors the course brief and notes which items are implemented
in the current codebase versus planned.

---

## 1. Actors / roles

| Role | Description |
| --- | --- |
| **Admin** | A Professor with system-administration responsibilities. Creates Professor and Coordinator accounts, issues one-time password reset links, manages audit logs. |
| **Coordinator** | A Professor who runs the course: configures rubrics, weights, schedules, committees, and the valid-student-id whitelist; transfers groups between advisors. |
| **Advisor** | A Professor who supervises one or more groups and grades their sprint work. |
| **Committee Member** | A Professor who reviews and grades deliverables for groups other than their own. |
| **Team Leader** | A Student who created a group; manages its members and integration configuration. |
| **Student** | Registered against the coordinator-uploaded student-id whitelist. May be a Team Leader or a regular member. |

Roles are implemented as `User.role ∈ {ADMIN, COORDINATOR, PROFESSOR, STUDENT}`.
"Advisor" and "Committee Member" are not separate database roles — they are
relationships expressed by `GroupAdvisorAssignment` and committee-grade rows.

---

## 2. Functional requirements

### 2.1 Authentication & identity
- Students register against a coordinator-uploaded valid-student-id list and
  link their GitHub account via OAuth.
- Professors are manually registered by an Admin and forced to change their
  password on first login.
- Login is uniform across roles: students authenticate by 11-digit student
  ID, all other roles by email + password.
- Admins can issue one-time password reset links; tokens are atomically
  consumed and invalidate prior sessions.

### 2.2 Group management
- Students may create groups while the coordinator's schedule allows it.
  Creator becomes Team Leader.
- Team Leader invites members by 11-digit student ID; an invitation is a
  notification. Approving an invitation auto-rejects all other pending
  invitations to the same student.
- Coordinator may add or remove members manually.
- Team Leader configures GitHub + JIRA integration for the group.

### 2.3 Advisor / committee assignment
- Team Leader sends an Advisee Request to a Professor; can withdraw it.
- An Advisor must release a team before the team can request another.
- Coordinator may transfer a group between advisors.
- Groups left without an advisor are sanitised (disbanded).
- Each Advisor sits on one Committee. Committees grade groups other than
  their own members'. Coordinator may add additional jury.

### 2.4 Deliverables
- Three deliverable types: **Proposal**, **Statement of Work (SoW)**,
  **Demonstration**. Coordinator may add others.
- Students submit through a markdown editor with image-insertion support.
- Only groups that have an assigned committee can submit (proposal + SoW).
- Committee reviews with comments; if changes are requested, students
  re-submit and committee re-grades.
- All bounded by the Coordinator's per-deliverable schedule.

### 2.5 Grading
- Two grading styles per rubric criterion:
  - **Binary**: `S` = 100, `F` = 0.
  - **Soft**: `A` = 100, `B` = 80, `C` = 60, `D` = 50, `F` = 0.
- Coordinator builds an Evaluation Rubric per deliverable and per-sprint
  story-point targets per student.
- Score values are persisted on the 0–100 scale.
- An advisor can submit/update a single soft grade per (group × deliverable).
- Each committee member can submit one grade per (group × deliverable);
  multiple committee members can grade the same deliverable.

### 2.6 Sprint monitoring (JIRA + GitHub)
- A team binds a JIRA workspace and a GitHub organisation/repo to itself.
- Daily refresh fetches active stories per sprint (issue key, work,
  assignee, status, story points) and matches them to GitHub PRs by
  branch-name prefix.
- For each PR the system records merge state, file diffs, changed-file
  list, and timestamps.
- Live grades are visible to advisors during the sprint.

### 2.7 AI sprint analysis (issue #430)
- **PR review verification (difficulty 3)** — for each stored PR the system
  asks Claude (Anthropic API) whether a substantive code review took place.
  Result (`REVIEWED` / `NOT_REVIEWED`) is persisted on `SprintPullRequest`
  and aggregated into the Team Evaluation grading.
  - Trigger: `POST /api/v1/teams/:teamId/sprints/:sprintId/pr-review-verifications`
  - Read: `GET   /api/v1/teams/:teamId/sprints/:sprintId/pr-review-verifications`
- **Implementation validation (difficulty 4)** — the system sends each
  JIRA issue description + the matched PR's file diffs to Claude; the AI
  returns `MATCHED` / `PARTIAL_MATCH` / `NOT_MATCHED` with confidence and
  feedback. Persisted as `AIValidationResult` rows.
  - Business Flow 13: `POST /api/v1/teams/:teamId/sprints/:sprintId/ai-validations`
  - Business Flow 14: `POST /internal/evaluations/validation-results` (forward to evaluator)
  - Business Flow 15: `POST /internal/sprint-sync/ai-validations` (batch upsert)
- **Aggregation**: `GET /api/v1/teams/:teamId/sprints/:sprintId/ai-signals`
  returns `reviewedRatio` and `matchedRatio` consumed by Team Evaluation.
- **Graceful degradation**: when `ANTHROPIC_API_KEY` is unset (or the
  account is out of credits), each call stores `AI_UNAVAILABLE` /
  `AI_ERROR` instead of failing — the rest of the grading pipeline keeps
  working.

### 2.8 Final evaluation
- Sprint Scrum + Code-Review grades (soft) average to a per-sprint
  coefficient. Sprint coefficients are weighted per the Coordinator's
  sprint→deliverable mapping to produce a per-deliverable scalar.
- Per-deliverable raw grade × scalar × deliverable weight → team grade.
- Story-point completion ratios determine each member's individual grade
  (`team_grade × ratio`).
- Team scalar, weight configuration, contribution ratios, and finalisation
  are persisted in `TeamScalar`, `FinalEvaluationWeight`, `MemberFinalGrade`.
- Worked example from the brief lives in `README.md` for reference.

### 2.9 Notifications
- Group invitations, advisor requests, committee assignments, and password
  reset links each generate notifications visible from the user's profile
  menu.

---

## 3. Non-functional requirements

| # | Requirement |
| --- | --- |
| NFR1 | ≥ 500 concurrent users without performance degradation. |
| NFR2 | 95th-percentile response time ≤ 2 s. |
| NFR4 | All user activity logged for ≥ 1 year, accessible only to authorised personnel. |
| NFR5 | Uptime ≥ 99.5 %/month, excluding scheduled maintenance. |
| NFR6 | Latest Chrome / Firefox / Safari / Edge on desktop and mobile. |
| NFR7 | All user-facing pages meet WCAG 2.1 AA. |
| NFR8 | Daily automated backups with ≤ 4 h restore. |
| NFR9 | Critical actions (grading, group changes, deliverable submissions) are auditable in `AuditLog`. |
| NFR10 | Modular code + clear documentation; new developers productive within 2 weeks. |
| NFR11 | GDPR-equivalent compliance — data export and deletion supported. |
| NFR12 | Horizontal scaling for peak load (submission deadlines). |

---

## 4. Integration requirements

- **GitHub OAuth** for student account linking and PR access.
- **GitHub** REST API for PR fetch, branch verification, merge status, file
  diffs, and PR review comments (used by AI verification).
- **JIRA** REST API for sprint issues, story points, and active-story sync.
- **Anthropic Claude API** for PR review verification and implementation
  validation.
- **Supabase Postgres** for production persistence; the same Sequelize
  models work against local SQLite for development.

---

## 5. System processes (use-case summary)

| Process | Components touched |
| --- | --- |
| User registration | Frontend, Auth (NextAuth-style), `Users`, `ValidStudentId`, `LinkedGitHubAccount` |
| Group creation & membership | `Groups`, `Invitation`, notification service |
| Mentor matching | `AdvisorRequest`, `GroupAdvisorAssignment`, notifications |
| Deliverable management | Markdown editor, `Deliverable`, `DeliverableSubmission`, `DeliverableRubric`, `DeliverableWeightConfiguration` |
| Committee review | `CommitteeReview`, `Submissions`, `AuditLog` |
| Sprint monitoring | JIRA + GitHub clients, `SprintStory`, `SprintPullRequest`, `PrMetric`, `StoryMetric` |
| AI sprint analysis | Anthropic client, `aiService`, `aiFeatureService`, `AIValidationResult`, `SprintPullRequest.reviewVerified` |
| Final evaluation | `FinalEvaluationGrade`, `FinalEvaluationWeight`, `TeamScalar`, `MemberFinalGrade`, `evaluationAggregationService`, `sprintEvaluationMetricsService` |
| Notifications | `Notification`, `NotificationViewport` (frontend) |
| Audit | `AuditLog` (fire-and-forget from every grade-mutating service) |

---

## 6. Implementation status snapshot

| Capability | Status |
| --- | --- |
| Student / professor / coordinator / admin login | ✅ implemented (see [PASSWORDS.md](PASSWORDS.md) for demo accounts) |
| Group create / invite / manage | ✅ |
| Advisor request / transfer / release | ✅ |
| Deliverable markdown editor + submission | ✅ |
| Committee grading endpoints (advisor + committee, 0–100 scale, optional `deliverableId`) | ✅ |
| Coordinator weight configuration + team-scalar calc | ✅ |
| Per-member contribution ratio + final grade finalise | ✅ |
| Sprint monitoring (JIRA sync, GitHub PR sync, snapshot) | ✅ |
| AI PR review verification (issue #430 part 1) | ✅ Backend, frontend panel, real Anthropic call |
| AI implementation validation BF13/14/15 (issue #430 part 2) | ✅ Backend, frontend panel, real Anthropic call |
| AI signals folded into Team Evaluation grading aggregation | ✅ |
| GitHub OAuth | ✅ Backend redirect + state model; frontend pickup via `Register.jsx` |
| Daily JIRA/GitHub refresh job | ✅ Scheduler service |
| Audit log retrieval UI | ✅ `/admin/audit-logs` |
| Supabase production deployment | ✅ Backend reads `DATABASE_URL`; seed script populates Supabase |
