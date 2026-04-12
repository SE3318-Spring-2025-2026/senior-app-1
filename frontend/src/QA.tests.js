// ─────────────────────────────────────────────────────────────────────────────
// Frontend E2E tests: Group invitation flow
// Framework: Playwright  (install: npm install -D @playwright/test)
// Run:       npx playwright test group-invitations.e2e.js
// ─────────────────────────────────────────────────────────────────────────────
// These tests will FAIL until:
//   1. A student group dashboard page exists at /student/group or similar.
//   2. The invite form and pending invitations list are rendered.
//   3. The backend invitation endpoint is wired up.
// ─────────────────────────────────────────────────────────────────────────────

const { test, expect } = require('@playwright/test');

// ── Shared test data ──────────────────────────────────────────────────────────
const LEADER = {
  studentId: '11070001000',
  password: 'StrongPass1!',
  email: 'leader@example.edu',
  fullName: 'Team Leader',
};

const MEMBER_A = { studentId: '11070001001' };
const MEMBER_B = { studentId: '11070001002' };
const INELIGIBLE = { studentId: '11070001999' };   // valid format, not in registry
const MALFORMED  = { studentId: 'bad-id' };         // not 11 digits

// ── Helper: log in as leader and navigate to invite page ─────────────────────
async function loginAsLeader(page) {
  await page.goto('/student/login');
  await page.getByLabel(/student id/i).fill(LEADER.studentId);
  await page.getByLabel(/password/i).fill(LEADER.password);
  await page.getByRole('button', { name: /log in/i }).click();
  // Wait until redirected to student dashboard.
  await page.waitForURL(/\/student\//);
}

async function goToInvitePage(page) {
  // Navigate to the group management / invite section.
  // Adjust selector to match actual nav label once UI is built.
  await page.getByRole('link', { name: /my group|group management|invite/i }).click();
  await page.waitForURL(/\/student\/group/);
}

// ─────────────────────────────────────────────────────────────────────────────
// POSITIVE PATH
// Leader invites 2 students → sees both appear in pending invitations list.
// ─────────────────────────────────────────────────────────────────────────────

test('leader invites 2 students and sees them in pending invitations list', async ({ page }) => {
  await loginAsLeader(page);
  await goToInvitePage(page);

  // ── Invite first student ───────────────────────────────────────────────────
  const studentIdInput = page.getByLabel(/student id/i);
  const inviteButton   = page.getByRole('button', { name: /invite|send invitation/i });

  await studentIdInput.fill(MEMBER_A.studentId);
  await inviteButton.click();

  // Success feedback must appear (no error message).
  await expect(
    page.getByText(/invitation sent|invited successfully/i),
  ).toBeVisible({ timeout: 5000 });

  // ── Invite second student ──────────────────────────────────────────────────
  await studentIdInput.fill(MEMBER_B.studentId);
  await inviteButton.click();

  await expect(
    page.getByText(/invitation sent|invited successfully/i),
  ).toBeVisible({ timeout: 5000 });

  // ── Pending invitations section must show both students ───────────────────
  const pendingSection = page.getByRole('region', { name: /pending invitations/i });
  await expect(pendingSection).toBeVisible();

  await expect(
    pendingSection.getByText(MEMBER_A.studentId),
  ).toBeVisible({ timeout: 5000 });

  await expect(
    pendingSection.getByText(MEMBER_B.studentId),
  ).toBeVisible({ timeout: 5000 });

  // Both entries must show PENDING status badge.
  const pendingBadges = pendingSection.getByText(/pending/i);
  await expect(pendingBadges).toHaveCount(2);
});

// ─────────────────────────────────────────────────────────────────────────────
// NEGATIVE PATH — malformed student ID
// Shows validation error; no invitation row created; list unchanged.
// ─────────────────────────────────────────────────────────────────────────────

test('inviting a malformed student ID shows an error and creates no invitation', async ({ page }) => {
  await loginAsLeader(page);
  await goToInvitePage(page);

  const studentIdInput = page.getByLabel(/student id/i);
  const inviteButton   = page.getByRole('button', { name: /invite|send invitation/i });

  await studentIdInput.fill(MALFORMED.studentId);
  await inviteButton.click();

  // Error message must be visible.
  await expect(
    page.getByText(/invalid student id/i),
  ).toBeVisible({ timeout: 5000 });

  // No success message must appear.
  await expect(
    page.getByText(/invitation sent|invited successfully/i),
  ).not.toBeVisible();

  // Pending invitations list must be empty (or unchanged).
  const pendingSection = page.getByRole('region', { name: /pending invitations/i });
  await expect(
    pendingSection.getByText(MALFORMED.studentId),
  ).not.toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// NEGATIVE PATH — ineligible student ID
// Valid format but not in registry → shows not-eligible error; no invite created.
// ─────────────────────────────────────────────────────────────────────────────

test('inviting an ineligible student ID shows not-eligible error and creates no invitation', async ({ page }) => {
  await loginAsLeader(page);
  await goToInvitePage(page);

  const studentIdInput = page.getByLabel(/student id/i);
  const inviteButton   = page.getByRole('button', { name: /invite|send invitation/i });

  await studentIdInput.fill(INELIGIBLE.studentId);
  await inviteButton.click();

  // Error message must be visible.
  await expect(
    page.getByText(/not eligible|student not eligible/i),
  ).toBeVisible({ timeout: 5000 });

  // No success message must appear.
  await expect(
    page.getByText(/invitation sent|invited successfully/i),
  ).not.toBeVisible();

  // Pending list must not contain the ineligible ID.
  const pendingSection = page.getByRole('region', { name: /pending invitations/i });
  await expect(
    pendingSection.getByText(INELIGIBLE.studentId),
  ).not.toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// NEGATIVE PATH — empty student ID field
// Submit with no input → shows required-field error; no invite created.
// ─────────────────────────────────────────────────────────────────────────────

test('submitting invite form with empty student ID shows required-field error', async ({ page }) => {
  await loginAsLeader(page);
  await goToInvitePage(page);

  const inviteButton = page.getByRole('button', { name: /invite|send invitation/i });

  // Click without filling the input.
  await inviteButton.click();

  // Some form-level or API-level error must appear.
  await expect(
    page.getByText(/required|please enter|student id is required/i),
  ).toBeVisible({ timeout: 5000 });

  // No success message.
  await expect(
    page.getByText(/invitation sent|invited successfully/i),
  ).not.toBeVisible();
});