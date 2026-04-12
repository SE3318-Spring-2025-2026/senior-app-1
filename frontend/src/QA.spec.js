// ─────────────────────────────────────────────────────────────────────────────
// E2E: invitee accepts and sees status change; non-invitee cannot respond
// Framework: Playwright  (install: npm install -D @playwright/test)
// Run:       npx playwright test invitation-response.e2e.js
// ─────────────────────────────────────────────────────────────────────────────
// Will FAIL until:
//   1. Invitation detail page exists with accept/decline buttons.
//   2. Accepting updates visible status to ACCEPTED.
//   3. Non-invitee is blocked from seeing or responding to the invitation.
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const LEADER   = { studentId: '11070001000', password: 'StrongPass1!' };
const INVITEE  = { studentId: '11070001001', password: 'StrongPass1!' };
const STRANGER = { studentId: '11070001002', password: 'StrongPass1!' };
const GROUP_NAME = 'E2E Response Team';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAs(page, studentId, password) {
  await page.goto('/students/login');
  await page.getByLabel(/student number|student id/i).fill(studentId);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await expect(page.getByText(/signed in successfully|student login successful/i)).toBeVisible({ timeout: 10000 });
}

async function logout(page) {
  await page.getByRole('button', { name: /log out|sign out/i }).click();
  await page.waitForURL(/\/.*login/);
}

// Leader creates group and invites INVITEE — returns invitation detail URL.
async function setupInvitation(page) {
  await loginAs(page, LEADER.studentId, LEADER.password);

  await page.getByRole('link', { name: /my group|group management|create group/i }).click();
  await page.waitForURL(/\/student\/group/);
  await page.getByLabel(/group name/i).fill(GROUP_NAME);
  await page.getByRole('button', { name: /create group/i }).click();
  await expect(page.getByText(GROUP_NAME)).toBeVisible({ timeout: 5000 });

  await page.getByLabel(/student id/i).fill(INVITEE.studentId);
  await page.getByRole('button', { name: /invite|send invitation/i }).click();
  await expect(
    page.getByText(/invitation sent|invited successfully/i),
  ).toBeVisible({ timeout: 5000 });

  await logout(page);
}

// Navigate to the invitation detail page for the invitee.
async function openInvitationDetail(page) {
  const notificationStack = page.locator('[aria-live="polite"]');
  await expect(notificationStack).toBeVisible({ timeout: 8000 });

  const inviteNotification = notificationStack
    .locator('section.notification')
    .filter({ hasText: /invitation|group invite|E2E Response Team/i });

  await expect(inviteNotification).not.toHaveCount(0, { timeout: 8000 });

  // Click view/details link or button inside the notification.
  const detailTrigger = inviteNotification
    .getByRole('link', { name: /view|details|open/i })
    .or(inviteNotification.getByRole('button', { name: /view|details|open/i }));

  await detailTrigger.click();
  await expect(page.getByText(GROUP_NAME)).toBeVisible({ timeout: 5000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Invitee accepts and sees status change to ACCEPTED
// ─────────────────────────────────────────────────────────────────────────────

test('invitee accepts invitation and sees status change to ACCEPTED', async ({ page }) => {
  await setupInvitation(page);

  // Log in as invitee.
  await loginAs(page, INVITEE.studentId, INVITEE.password);
  await openInvitationDetail(page);

  // Accept button must be present.
  const acceptButton = page.getByRole('button', { name: /accept/i });
  await expect(acceptButton).toBeVisible({ timeout: 5000 });
  await acceptButton.click();

  // After accepting, status badge/text must show ACCEPTED.
  await expect(
    page.getByText(/accepted/i),
  ).toBeVisible({ timeout: 5000 });

  // Accept button must disappear — invitation already responded to.
  await expect(acceptButton).not.toBeVisible({ timeout: 3000 });

  // Decline button must also disappear.
  await expect(
    page.getByRole('button', { name: /decline|reject/i }),
  ).not.toBeVisible({ timeout: 3000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Invitee declines and sees status change to REJECTED
// ─────────────────────────────────────────────────────────────────────────────

test('invitee declines invitation and sees status change to REJECTED', async ({ page }) => {
  await setupInvitation(page);

  await loginAs(page, INVITEE.studentId, INVITEE.password);
  await openInvitationDetail(page);

  const declineButton = page.getByRole('button', { name: /decline|reject/i });
  await expect(declineButton).toBeVisible({ timeout: 5000 });
  await declineButton.click();

  // After declining, status badge/text must show REJECTED or DECLINED.
  await expect(
    page.getByText(/rejected|declined/i),
  ).toBeVisible({ timeout: 5000 });

  // Both action buttons must disappear.
  await expect(
    page.getByRole('button', { name: /accept/i }),
  ).not.toBeVisible({ timeout: 3000 });

  await expect(declineButton).not.toBeVisible({ timeout: 3000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Non-invitee cannot see or respond to the invitation
// ─────────────────────────────────────────────────────────────────────────────

test('non-invitee cannot see or respond to the invitation', async ({ page }) => {
  await setupInvitation(page);

  // Log in as stranger — was never invited.
  await loginAs(page, STRANGER.studentId, STRANGER.password);

  // Notification stack must have no invitation notification for stranger.
  const notificationStack = page.locator('[aria-live="polite"]');
  const inviteNotification = notificationStack
    .locator('section.notification')
    .filter({ hasText: /invitation|group invite|E2E Response Team/i });

  await expect(inviteNotification).toHaveCount(0, { timeout: 5000 });

  // If stranger tries to navigate directly to invitation detail, they must see
  // a forbidden or not-found message — not the invitation content.
  // We attempt a direct URL guess; the exact path depends on implementation.
  await page.goto('/student/invitations/1');

  await expect(
    page.getByText(/not found|forbidden|access denied|you do not have permission/i),
  ).toBeVisible({ timeout: 5000 });

  // Accept and decline buttons must NOT be present.
  await expect(
    page.getByRole('button', { name: /accept/i }),
  ).not.toBeVisible();

  await expect(
    page.getByRole('button', { name: /decline|reject/i }),
  ).not.toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Already-responded invitation shows correct final status, no actions
// ─────────────────────────────────────────────────────────────────────────────

test('already-accepted invitation shows ACCEPTED and hides action buttons', async ({ page }) => {
  await setupInvitation(page);

  // Invitee accepts.
  await loginAs(page, INVITEE.studentId, INVITEE.password);
  await openInvitationDetail(page);
  await page.getByRole('button', { name: /accept/i }).click();
  await expect(page.getByText(/accepted/i)).toBeVisible({ timeout: 5000 });

  // Reload page — status must persist, buttons must stay hidden.
  await page.reload();
  await expect(page.getByText(/accepted/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: /accept/i })).not.toBeVisible();
  await expect(page.getByRole('button', { name: /decline|reject/i })).not.toBeVisible();
});