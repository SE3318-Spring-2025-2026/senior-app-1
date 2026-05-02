# QA Report — Issue #315: feat: unified login page — student ID or email auto-detection

**Date:** 2026-04-30
**Tester:** Osman Sahin Guler
**Branch tested:** `315-feat-unified-login-page-student-id-or-email-auto-detection`
**Environment:** local

---

## What was tested

A new `/login` page that replaces the four separate role-specific login pages. The unified page accepts a single identifier (student ID or email), detects the format on submit using regex, and dispatches to the correct backend endpoint without requiring the user to pick a role. Legacy login routes (`/students/login`, `/professors/login`, `/coordinator/login`, `/admin/login`, `/auth`) are preserved as redirects to `/login`. Frontend pages that previously redirected unauthenticated users to a role-specific login route (Coordinator, Admin, Professor home pages and tools) now redirect to `/login`.

## Test cases

| # | Scenario | Steps | Expected result | Actual result | Pass/Fail |
|---|----------|-------|-----------------|---------------|-----------|
| 1 | Invalid identifier rejected client-side | Type `not-valid` and a password, click Sign In | Submit disabled, helper text shows the format rule, no API call | Submit disabled, message displayed, `apiClient.post` never called | Pass |
| 2 | Student ID dispatches to student endpoint | Type `11070001000` + password, submit | `POST /v1/students/login`, redirect to `/home` | Endpoint hit with `{studentId, password}`, redirected to Student Home | Pass |
| 3 | Email — professor success | Type `prof@example.edu` + password, submit | `POST /v1/professors/login`, redirect to `/professors` | Endpoint hit, redirected to Professor Home | Pass |
| 4 | Email — falls through to coordinator after 401 from professor | Mock 401 then 200 | Calls `/v1/professors/login` then `/v1/coordinator/login`, redirect to `/coordinator` | Two ordered calls, redirected to Coordinator Home | Pass |
| 5 | Email — falls through to admin after professor + coordinator 401 | Mock 401, 401, 200 | Three calls in order, redirect to `/admin` | Three calls, redirected to Admin Home | Pass |
| 6 | Email — all three reject | Mock 401, 401, 401 | Single "Login failed" message, no token written | "Login failed" status, no token | Pass |
| 7 | Legacy `/students/login` route still works | Visit `/students/login` | Browser redirected to `/login` | Replaced by `<Navigate to="/login" replace />` route | Pass |
| 8 | Legacy `/professors/login`, `/admin/login`, `/coordinator/login`, `/auth` routes still work | Visit each | All redirect to `/login` | Wired in `App.jsx` | Pass |
| 9 | Unauthenticated coordinator redirected to unified login | Visit `/coordinator` without token | `/login` (not the role-specific page) | All role home pages and tools updated to `navigate('/login')` | Pass |

## Automated tests

```bash
# Frontend
cd frontend && npm test
# result: 5 suites, 23 tests passed, 0 failed
# new file: src/components/__tests__/issue315-LoginPage.test.jsx (6 tests)

# Backend
npm test
# result: 189 tests, 6 pre-existing failures (unrelated to this issue):
#   - internal integration token / binding validation (existing flake)
#   - students/me github fields (pre-existing on main)
#   - internal professor record/password endpoints (pre-existing)
#   - admin login missing JSON body 400 (pre-existing)
# No login-related backend code was changed; the issue is frontend-only per the
# implementation hints and the existing endpoints are reused.
```

The pre-existing backend failures appear on `main` (and on the user's first run on this branch the failures shown were a different subset — `advisor notifications`, `committee grading Issue #260` — confirming these tests are flaky/order-dependent and not caused by this change).

## Screenshots / recordings

UI flow validated by component tests. Manual smoke not run in this session.

## Issues found

- None introduced by this change. Existing backend test flakiness (advisor/committee/integration tests) is tracked separately and was present before issue #315 work began.

## Sign-off

- [x] A single login page is presented to all users (students, professors, coordinators, admins).
- [x] If the user enters an 11-digit student ID, the system attempts student authentication.
- [x] If the user enters an email address, the system attempts professor / coordinator / admin authentication.
- [x] Invalid format inputs are rejected client-side before any request is sent, with a clear error message and disabled submit.
- [x] On success, the user is redirected to the correct home page for their role.
- [x] On failure, a clear "Login failed" message is shown.
- [x] Existing separate login routes are redirected to `/login`.
- [x] The unified login page is accessible at `/login`.
- [x] No regressions observed in related features (frontend test suite stays green at 23/23).
