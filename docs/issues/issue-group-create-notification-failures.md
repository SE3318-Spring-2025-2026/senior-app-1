# Issue: Group Creation Fails, Cascading Notification Test Failures

## Summary
`POST /api/v1/groups` returned HTTP 500 during notification test flows because the `Group` model schema did not match the fields used by `groupService` and `groupController`.

## Observed Failure
- Backend test suite had 3 failing tests in notification scenarios.
- Root error:
  - `SequelizeValidationError: notNull Violation: Group.name cannot be null`
- Cascade error in tests:
  - `TypeError: Cannot read properties of undefined (reading 'groupId')`

## Root Cause
The model in `backend/models/Group.js` used persisted fields `name` and `memberIds`, while group runtime logic expected `groupName`, `members`, `maxMembers`, and `status`.

## Impact
- Group creation endpoint failed in runtime paths.
- Membership finalize notification paths could not execute because no group was created.

## Fix Implemented
- Added compatibility mapping in the `Group` model:
  - Virtual `groupName` mapped to persisted `name`.
  - Virtual `members` mapped to persisted `memberIds`.
- Added required persisted fields used by membership flow:
  - `maxMembers` (INTEGER, default `4`)
  - `status` (STRING, default `FORMATION`)
- Added default ID generation for runtime group creation when ID is not supplied.

## Validation
- Backend tests: `25/25` passing.
- Frontend build: successful.

## Branch
- `issue/group-create-notification-failures`
