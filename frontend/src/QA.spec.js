// Consolidated QA flows aligned to currently implemented UI behaviors.

import { test, expect } from '@playwright/test';

const LEADER   = { studentId: '11070001000', password: 'StrongPass1!' };
const INVITEE  = { studentId: '11070001001', password: 'StrongPass1!' };
const GROUP_NAME = 'E2E Response Team';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAs(page, studentId, password) {
  await page.goto('/students/login');
  await page.getByLabel(/student number|student id/i).fill(studentId);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await expect(page.getByRole('heading', { name: /signed in successfully/i })).toBeVisible({ timeout: 10000 });
}

async function openGroupFormation(page) {
  await loginAs(page, LEADER.studentId, LEADER.password);
  await page.goto('/students/group');
  await expect(page.getByRole('heading', { name: /group formation/i })).toBeVisible();
}

async function createGroup(page) {
  await openGroupFormation(page);
  await page.getByRole('button', { name: /create a new group/i }).click();
  await page.getByLabel(/group name/i).fill(GROUP_NAME);
  await page.getByRole('button', { name: /create group/i }).click();
  await expect(page.getByText(GROUP_NAME)).toBeVisible({ timeout: 5000 });
}

async function inviteStudents(page, idsText) {
  await createGroup(page);
  await page.getByLabel(/invite student ids/i).fill(idsText);
  await page.getByRole('button', { name: /send invitations/i }).click();
}
test('student login shows successful status feedback', async ({ page }) => {
  await loginAs(page, LEADER.studentId, LEADER.password);
});

test('team leader can create a group shell', async ({ page }) => {
  await createGroup(page);
  await expect(page.getByText(/your group shell has been created/i)).toBeVisible();
});

test('team leader can send invitations and see pending entries', async ({ page }) => {
  await inviteStudents(page, `${INVITEE.studentId},11070001002`);
  await expect(page.getByText(/pending invitations/i)).toBeVisible();
  await expect(page.getByText(INVITEE.studentId)).toBeVisible();
  await expect(page.getByText(/invitations sent/i)).toBeVisible();
});

test('invalid student id input shows validation failures', async ({ page }) => {
  await inviteStudents(page, 'invalid001,error_id');
  const summary = page.locator('#invite-error-summary');
  await expect(summary.getByText(/validation failures/i)).toBeVisible();
  await expect(summary.getByText(/some student ids failed validation/i)).toBeVisible();
});