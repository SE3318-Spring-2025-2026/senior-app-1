# Clean Architecture Reimplementation Plan

This plan replaces issue-per-assertion workflow with phased, bounded implementation.

## Phase 1: Backend Domain Consistency
- Align models, services, and controllers on shared field contracts.
- Define explicit compatibility behavior where old and new fields overlap.
- Add regression tests for service/controller integration paths.

## Phase 2: E2E Harness Stability
- Standardize Playwright environment bootstrapping.
- Define deterministic seed prerequisites for runtime login and group-flow scenarios.
- Keep generated artifacts out of tracked source diffs.

## Phase 3: Frontend Route and QA Flow Alignment
- Ensure tested routes exist and are discoverable in app navigation or direct links.
- Keep QA scenarios scoped to currently implemented product capabilities.
- Use stable, unambiguous selectors and strict-mode-safe assertions.

## PR Strategy
- One issue and one PR per phase.
- Acceptance criteria in each issue must be measurable and test-backed.
- Avoid creating new issues for each failing assertion unless it introduces a new domain boundary.

## Exit Criteria
- Backend tests pass.
- Frontend build passes.
- Playwright scenario suite for implemented flows passes.
- Open issues map to domain phases, not individual assertions.

