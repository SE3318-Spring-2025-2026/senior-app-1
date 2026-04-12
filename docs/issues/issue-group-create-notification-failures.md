# Issue: Group Creation Fails and Breaks Notification Runtime Tests

## Problem
Runtime tests showed `POST /api/v1/groups` returning HTTP 500. This prevented notification membership flows from running and caused tests to fail when reading `groupId` from the creation response.

## Evidence
- Error observed: `SequelizeValidationError: notNull Violation: Group.name cannot be null`
- Cascading test error: `TypeError: Cannot read properties of undefined (reading 'groupId')`
- Affected tests were notification/finalize membership paths in backend API tests.

## Suspected Root Cause
`Group` model fields did not align with fields used by group creation/finalization flow:
- Runtime uses: `groupName`, `members`, `maxMembers`, `status`
- Model persisted fields were primarily: `name`, `memberIds`

## Proposed Fix
- Add model compatibility mapping between:
  - `groupName` <-> `name`
  - `members` <-> `memberIds`
- Ensure `maxMembers` and `status` are available and have sane defaults.
- Ensure group IDs are generated when group creation does not supply `id`.

## Validation Plan
- Run backend tests and ensure notification tests pass.
- Run frontend build to ensure no regressions.
