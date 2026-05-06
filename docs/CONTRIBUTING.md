# Contributing to Senior App

This guide tells contributors — humans and AI assistants — exactly **where** to put code and **what patterns** to follow when implementing an issue in this repo. If you read only one section, read [Implementing an Issue End-to-End](#implementing-an-issue-end-to-end).

---

## Table of Contents

1. [Project Layout](#project-layout)
2. [Setup & Run](#setup--run)
3. [Implementing an Issue End-to-End](#implementing-an-issue-end-to-end)
4. [Backend Conventions](#backend-conventions)
5. [Frontend Conventions](#frontend-conventions)
6. [Testing](#testing)
7. [Branching, Commits, PRs](#branching-commits-prs)
8. [Dos & Don'ts](#dos--donts)

---

## Project Layout

```
senior-app-1/
├── backend/                    Express + Sequelize + SQLite
│   ├── app.js                  Express app: route mounting, body parsers, global error handler
│   ├── server.js               Boots app.listen + sequelize.sync
│   ├── db.js                   Sequelize instance (SQLite, file or :memory:)
│   ├── models/                 Sequelize models — one file per model
│   │   └── index.js            Central registry — every model MUST be re-exported here
│   ├── controllers/            HTTP handlers + express-validator middleware
│   ├── services/               Business logic, transactions, cross-model orchestration
│   ├── repositories/           Direct DB access wrappers (use sparingly — only when reused)
│   ├── routes/                 Express routers — one file per top-level resource
│   ├── middleware/             auth.js (authenticate + authorize role-gates)
│   ├── errors/                 Custom error classes
│   └── test/                   node:test integration tests (real SQLite, real HTTP)
│
├── frontend/                   React + Vite
│   └── src/
│       ├── App.jsx             Top-level <Routes> — register every page here
│       ├── main.jsx            Entry point
│       ├── components/         Reusable UI (AppShell, AuthGuard, NotificationViewport, …)
│       ├── contexts/           React contexts (AuthContext, NotificationContext)
│       ├── hooks/              Custom hooks (useGroupFormation, useStudentInvitations)
│       ├── services/           apiClient.js — single fetch wrapper for all API calls
│       └── *.jsx               Page components (one file per route, named `*Page.jsx`)
│
└── docs/                       OpenAPI specs, DFDs, this file
```

---

## Setup & Run

### Prerequisites

| Tool   | Required version | Why                                                                          |
| ------ | ---------------- | ---------------------------------------------------------------------------- |
| Node   | **≥ 20.19** (22 recommended) | Vite 7 uses `crypto.hash`, which lands in 20.19 / 22.12. |
| npm    | ≥ 9              | Ships with Node 20+.                                                         |

The repo includes a [`.nvmrc`](../.nvmrc) pinning Node 22. With nvm:

```bash
nvm use            # picks up .nvmrc
node --version     # should print v22.x or v20.19+
```

If `nvm` is not installed, follow https://github.com/nvm-sh/nvm#installing-and-updating, or use Node 22 from your distro's package manager.

### Install & seed

```bash
# from repo root
npm install                       # root deps (concurrently runners)
npm --prefix backend install
npm --prefix frontend install

# create backend/.env
echo "JWT_SECRET=dev-secret-change-me" > backend/.env

# create the seeded admin (admin@example.com / AdminPass2026!)
node backend/createAdmin.js

# run both servers
npm run dev
# backend  → http://localhost:3000
# frontend → http://localhost:5173
```

### Run tests

```bash
npm test                         # runs the backend test suite (node:test)
npm --prefix frontend test       # runs frontend tests (Jest + Playwright)
```

The backend test suite uses `:memory:` SQLite, so no extra setup is needed. If you see `crypto.hash is not a function` when starting the frontend, your Node is too old — upgrade to ≥ 20.19.

---

## Implementing an Issue End-to-End

When the issue says **"add endpoint X"** or **"add page Y"**, follow this checklist in order. Skipping a step will leave broken code.

### Backend feature (new endpoint)

1. **Model** → `backend/models/<ModelName>.js`
   - One Sequelize `define` per file, exporting the model.
   - Use `DataTypes.UUID` + `DataTypes.UUIDV4` for primary keys, except `User.id` which is `INTEGER`.
   - Define indexes inside the model options (`{ indexes: [...] }`), **never** call `Model.addConstraint(...)` — it crashes module load.
2. **Register the model** → append to `backend/models/index.js` (both the `require` and the `module.exports` block). If it isn't here, nothing else can import it.
3. **Service** → `backend/services/<feature>Service.js`
   - All business logic lives here. Validate domain rules, manage transactions, throw `Error` objects with a `.code` property for known failure cases.
   - Controllers must not reach into Sequelize directly except for trivial reads.
4. **Controller** → `backend/controllers/<feature>Controller.js`
   - Export both the handler and an `express-validator` array (e.g. `submitGradeValidation`).
   - Pattern: validate → call service → map service errors to HTTP codes → JSON response.
   - For UUID path params, use `param('x').isUUID()` (do **not** import `{ v4: isUUID }` — `v4` is a generator, not a validator; the correct import is `{ validate: isUUID }`).
5. **Route** → either a new `backend/routes/<resource>.js` file or an existing router.
   - Always wire `authenticate` + `authorize([...])` for protected routes.
6. **Mount the route** → add `app.use('/api/v1/<path>', <router>)` in `backend/app.js`. **Forgetting this means every request returns 404.**
7. **Test** → `backend/test/<feature>.test.js` (or append to `api.test.js`).
   - Add the file path to the `"test"` script in `backend/package.json`, otherwise the suite never runs it.
8. **Run** `npm test` and confirm all your new tests pass before committing.

### Frontend feature (new page)

1. **Page component** → `frontend/src/<Name>Page.jsx` (default export, top-level `*Page.jsx` file).
2. **API call** → use `frontend/src/services/apiClient.js`. Don't write raw `fetch` in components.
3. **Auth-gated routes** → wrap with `<AuthGuard>` (see existing pages for the pattern).
4. **Register the route** in `frontend/src/App.jsx`:
   ```jsx
   <Route path="/your-path" element={<YourPage />} />
   ```
5. **Navigation** → if it should appear in the sidebar, add an entry in `frontend/src/components/AppShell.jsx` for the relevant role.
6. **Reusable UI** → put shared components in `frontend/src/components/`. Page-private subcomponents stay inside the page file.
7. **Hooks for data flows** → if the page does non-trivial data fetching/state, extract it into `frontend/src/hooks/use<Name>.js`.

### Worked example: how PR #225 added `PUT /api/v1/coordinator/weights`

| Step | File |
|------|------|
| Model | `backend/models/SprintWeightConfiguration.js` |
| Registry | `backend/models/index.js` (added `SprintWeightConfiguration` to require + exports) |
| Controller | `backend/controllers/coordinatorWeightsController.js` (validation array + handler) |
| Route | `backend/routes/coordinator.js` (`router.put('/weights', authenticate, authorize(['COORDINATOR']), ...)`) |
| Mount | already mounted via `app.use('/api/v1/coordinator', coordinatorRoutes)` |
| Tests | `backend/test/issue224-coordinator-weights-api.test.js` |
| Wire tests | `backend/package.json` `"test"` script |

Use this as the canonical template.

---

## Backend Conventions

### Models
- Primary keys: `UUID` with `DataTypes.UUIDV4` default. Exception: `User` uses auto-increment `INTEGER`.
- Foreign keys to `User.id` are `INTEGER`. Foreign keys to UUID models are `UUID`. Don't mix.
- Enums: declare with `DataTypes.ENUM(...)`, not free-form strings.
- Unique constraints: declare under model options `indexes: [{ unique: true, fields: [...] }]`. Do **not** use `Model.addConstraint`.
- Associations live at the bottom of the model file or in `models/index.js`.

### Controllers
- Always run `validationResult(req)` first, return 400 with `code: 'VALIDATION_ERROR'` if not empty.
- Map known service-error codes to specific HTTP codes (`SUBMISSION_NOT_FOUND` → 404, `INVALID_*` → 400). Unknown errors → 500 with `code: 'INTERNAL_ERROR'` and `console.error` the original.
- Standard JSON envelope: `{ code, message, data? }` for success; `{ code, message, errors? }` for failure.

### Services
- Return raw Sequelize instances or plain objects — let the controller shape the response.
- Use `sequelize.transaction(async (t) => { ... })` whenever multiple writes must be atomic.
- For audit logging, use the **fire-and-forget** pattern (no `await` on the log call, attach `.catch(err => console.error(...))`). Awaiting the log adds latency and can fail the request.

### Routes
- Order: `authenticate` first, then `authorize([...])`, then validation middleware, then handler.
- Route file = top-level URL segment. New top-level segment = new file + new mount in `app.js`.

### Auth
- `req.user` is the full Sequelize `User` row. It has `id`, `role`, `email`, `fullName`. **It does NOT have `groupId`** — to find a student's group, query `Group` by `memberIds` containing `String(user.id)`.

### IDs in `Group.memberIds`
- Stored as a JSON array of **strings** (`["42", "57"]`). Always compare with `String(user.id)`, not the integer.

---

## Frontend Conventions

- **One file per page**, named `<Name>Page.jsx`, default-exported, registered in `App.jsx`.
- All HTTP calls go through `services/apiClient.js`. If the helper you need doesn't exist, add it there.
- Auth context lives in `contexts/AuthContext.jsx` — read the current user with `useAuth()`.
- For role-gated pages, wrap content in `<AuthGuard roles={['PROFESSOR', 'COORDINATOR']}>`.
- Shared layout: `components/AppShell.jsx`. Add new sidebar entries here, scoped by role.
- Notifications: emit through `NotificationContext`, read via `NotificationViewport`.
- Styles: a single `styles.css`. No CSS modules, no styled-components.

---

## Testing

### Backend
- Framework: built-in `node:test` + `node:assert/strict`.
- Tests run against **real SQLite in-memory DB** (`SQLITE_STORAGE=:memory:`), real HTTP, real auth.
- Setup helpers: `setupTestEnv.js` (loaded at top of every test file), `ensureValidStudentRegistry`, `createStudent`, `authHeaderFor`.
- Follow this skeleton:
  ```js
  require('./setupTestEnv');
  const test = require('node:test');
  const assert = require('node:assert/strict');
  // ...
  test.before(async () => { /* sync, ensureValidStudentRegistry, listen */ });
  test.after(async () => { /* close server, sequelize.close */ });
  test.beforeEach(async () => { /* destroy rows you create */ });
  test('descriptive title', async () => { /* arrange, act, assert */ });
  ```
- Add the test file to `backend/package.json` `"test"` script — it does **not** auto-discover.

### Frontend
- Jest for unit/component tests under `src/components/__tests__/`.
- Playwright for E2E in `src/QA.spec.js`.

### QA test reports

After running manual or automated QA on a feature, write a report and save it as:

```
docs/tests/issue-<N>-<short-description>.md
```

Example: `docs/tests/issue-225-sprint-weights.md`

Use this template:

```markdown
# QA Report — Issue #<N>: <Issue title>

**Date:** YYYY-MM-DD
**Tester:** Your Name
**Branch tested:** `<branch-name>`
**Environment:** local / staging

---

## What was tested

<!-- One paragraph: what feature or fix did you validate? -->

## Test cases

| # | Scenario | Steps | Expected result | Actual result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Happy path — valid payload | POST /api/v1/... with `{...}` | 200 + config in body | 200 ✓ | Pass |
| 2 | Missing required field | omit `deliverableType` | 400 VALIDATION_ERROR | 400 ✓ | Pass |
| 3 | Unauthenticated request | no Authorization header | 401 | 401 ✓ | Pass |
| 4 | Wrong role | login as STUDENT | 403 | 403 ✓ | Pass |

## Automated tests

```bash
npm test
# result: X passed, Y failed
```

Paste the relevant output lines here if any tests failed.

## Screenshots / recordings

<!-- Attach or link screenshots if UI was tested. Delete this section for API-only features. -->

## Issues found

<!-- List any bugs discovered during testing. Create a GitHub issue for each one. -->
- None

## Sign-off

- [ ] All acceptance criteria from the issue are met.
- [ ] No regressions observed in related features.
```

---

## Branching, Commits, PRs

### Branch names

**Always create branches from the GitHub issue page**, not by hand:

1. Open the issue on GitHub.
2. In the right sidebar under **Development**, click **"Create a branch"**.
3. GitHub will auto-name the branch from the issue number and title (e.g. `225-update-sprint-weights-api`). Use that name — don't rename it.
4. Check out the branch locally:
   ```bash
   git fetch origin
   git checkout 225-update-sprint-weights-api
   ```

This keeps the branch automatically linked to the issue so GitHub closes it when the PR merges.

### Commits
Conventional commits, one logical change per commit:
```
feat(coordinator): add PUT /weights for sprint weight configuration
fix(advisor): map ADVISOR_NOT_FOUND to 404 instead of 500
test(grading): cover concurrent committee grading scenario
docs(api): add OpenAPI spec for sprint monitoring
```

### Pull requests

**Title format:** `feat(issue-<N>): short description` — keep it under 70 characters.

```
feat(issue-225): add PUT /weights for sprint weight configuration
fix(issue-260): resolve Deliverable import crash in grading tests
docs(issue-279): add OpenAPI spec for sprint monitoring
```

**Body template** (copy this for every PR):

```markdown
## What this PR does
<!-- One paragraph. What feature or fix does it add? Why? -->

## Files added / changed
| Action   | File                                              | Why |
|----------|---------------------------------------------------|-----|
| Created  | backend/models/MyModel.js                         | ... |
| Modified | backend/routes/coordinator.js                     | ... |
| Created  | backend/test/issue-N-feature.test.js              | ... |

## How to test
1. `npm test` — all tests should pass.
2. Manual steps (if any): e.g. POST to `/api/v1/...` with payload `{...}`, expect 200.

## Acceptance criteria
- [ ] criterion 1
- [ ] criterion 2

## Notes
<!-- Anything a reviewer should know: edge cases, deferred work, known limitations. -->
```

**Before opening the PR:**
- Run `npm test` — fix any failures you introduced before requesting review.
- Scope: only touch files the issue requires. Don't refactor unrelated code in the same PR.
- Don't merge until the test suite is green for everything you touched.

---

## Writing Issues

Use this format when creating a GitHub issue for a new feature or a bug.

### Feature issue

```markdown
## Summary
<!-- One or two sentences: what should exist that doesn't yet? -->

## Acceptance criteria
- [ ] criterion 1 (specific, testable)
- [ ] criterion 2

## Implementation hints
<!-- Optional. Which files to touch, which pattern to follow. -->
Backend:
- Model: `backend/models/<ModelName>.js`
- Controller: `backend/controllers/<feature>Controller.js`
- Route: add to `backend/routes/<resource>.js`
- Tests: `backend/test/issue-N-<feature>.test.js`

Frontend (if applicable):
- Page: `frontend/src/<Name>Page.jsx`
- API helper: add to `frontend/src/services/apiClient.js`
- Register in: `frontend/src/App.jsx`

## Related issues / PRs
<!-- Link any related work here. -->
```

### Bug issue

```markdown
## Description
<!-- What goes wrong? What is the user-visible symptom? -->

## Steps to reproduce
1. ...
2. ...

## Expected behaviour
<!-- What should happen. -->

## Actual behaviour
<!-- What actually happens. Include error messages, stack traces, or screenshots. -->

## Root cause (if known)
<!-- What in the code causes this? Which file and line? -->

## Fix
<!-- If you already know the fix, describe it here. Otherwise leave blank. -->

## Affected files
- `backend/...`
```

### Issue title format

```
feat: <short description of the feature>       → for new functionality
fix: <short description of the bug>            → for bug reports
docs: <short description>                      → for documentation gaps
test: <short description>                      → for missing test coverage
```

---

## Dos & Don'ts

### Do
- Get **team leader approval** before changing any existing API endpoint (URL, method, request/response shape). Open a PR and have a team leader merge it — don't merge API changes yourself.
- Mount every new router in `app.js`.
- Register every new model in `models/index.js`.
- Add new test files to `backend/package.json` `"test"` script.
- Use `String(user.id)` when comparing against `Group.memberIds`.
- Use `String(user.id)` and look up the user's group via `Group.findOne({ where: { memberIds: ... } })` rather than `user.groupId` (it doesn't exist).
- Validate UUID params with `{ validate: isUUID }` from the `uuid` package.
- Use fire-and-forget for audit logging.
- Define unique constraints via the model `indexes` option.

### Don't
- Don't change an existing API endpoint (path, HTTP method, request body, or response shape) without team leader review and merge.
- Don't call `Model.addConstraint(...)` — it's not a function on Sequelize models and crashes module load.
- Don't `import { v4: isUUID } from 'uuid'` — `v4` generates UUIDs, it doesn't validate them.
- Don't `await` audit log writes inside request handlers.
- Don't write raw `fetch` calls in React components — use `apiClient`.
- Don't put business logic in controllers — push it down into services.
- Don't commit `frontend/test-results/` artifacts; they're auto-generated.
- Don't seed application data (rubrics, weights, etc.) in `server.js` — it bypasses the coordinator UI.
- Don't introduce parallel models for the same concept (e.g. `DeliverableSubmission` when `Deliverable` already exists). Reuse what's there or refactor it.

---

## When in doubt

- Look at the most recent merged PR that touched the same area and copy its file structure.
- The closest analog for a backend CRUD endpoint is `routes/coordinator.js` + `controllers/coordinatorWeightsController.js` + `models/SprintWeightConfiguration.js` (issue #225).
- The closest analog for a frontend page is the latest `*Page.jsx` registered in `App.jsx`.
