# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: QA.spec.js >> non-invitee cannot see or respond to the invitation
- Location: src/QA.spec.js:134:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/student/login
Call log:
  - navigating to "http://localhost:5173/student/login", waiting until "load"

```

# Test source

```ts
  1   | // ─────────────────────────────────────────────────────────────────────────────
  2   | // E2E: invitee accepts and sees status change; non-invitee cannot respond
  3   | // Framework: Playwright  (install: npm install -D @playwright/test)
  4   | // Run:       npx playwright test invitation-response.e2e.js
  5   | // ─────────────────────────────────────────────────────────────────────────────
  6   | // Will FAIL until:
  7   | //   1. Invitation detail page exists with accept/decline buttons.
  8   | //   2. Accepting updates visible status to ACCEPTED.
  9   | //   3. Non-invitee is blocked from seeing or responding to the invitation.
  10  | // ─────────────────────────────────────────────────────────────────────────────
  11  | 
  12  | import { test, expect } from '@playwright/test';
  13  | 
  14  | const LEADER   = { studentId: '11070001000', password: 'StrongPass1!' };
  15  | const INVITEE  = { studentId: '11070001001', password: 'StrongPass1!' };
  16  | const STRANGER = { studentId: '11070001002', password: 'StrongPass1!' };
  17  | const GROUP_NAME = 'E2E Response Team';
  18  | 
  19  | // ── Helpers ───────────────────────────────────────────────────────────────────
  20  | 
  21  | async function loginAs(page, studentId, password) {
> 22  |   await page.goto('/student/login');
      |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/student/login
  23  |   await page.getByLabel(/student id/i).fill(studentId);
  24  |   await page.getByLabel(/password/i).fill(password);
  25  |   await page.getByRole('button', { name: /log in/i }).click();
  26  |   await page.waitForURL(/\/student\//);
  27  | }
  28  | 
  29  | async function logout(page) {
  30  |   await page.getByRole('button', { name: /log out|sign out/i }).click();
  31  |   await page.waitForURL(/\/.*login/);
  32  | }
  33  | 
  34  | // Leader creates group and invites INVITEE — returns invitation detail URL.
  35  | async function setupInvitation(page) {
  36  |   await loginAs(page, LEADER.studentId, LEADER.password);
  37  | 
  38  |   await page.getByRole('link', { name: /my group|group management|create group/i }).click();
  39  |   await page.waitForURL(/\/student\/group/);
  40  |   await page.getByLabel(/group name/i).fill(GROUP_NAME);
  41  |   await page.getByRole('button', { name: /create group/i }).click();
  42  |   await expect(page.getByText(GROUP_NAME)).toBeVisible({ timeout: 5000 });
  43  | 
  44  |   await page.getByLabel(/student id/i).fill(INVITEE.studentId);
  45  |   await page.getByRole('button', { name: /invite|send invitation/i }).click();
  46  |   await expect(
  47  |     page.getByText(/invitation sent|invited successfully/i),
  48  |   ).toBeVisible({ timeout: 5000 });
  49  | 
  50  |   await logout(page);
  51  | }
  52  | 
  53  | // Navigate to the invitation detail page for the invitee.
  54  | async function openInvitationDetail(page) {
  55  |   const notificationStack = page.locator('[aria-live="polite"]');
  56  |   await expect(notificationStack).toBeVisible({ timeout: 8000 });
  57  | 
  58  |   const inviteNotification = notificationStack
  59  |     .locator('section.notification')
  60  |     .filter({ hasText: /invitation|group invite|E2E Response Team/i });
  61  | 
  62  |   await expect(inviteNotification).not.toHaveCount(0, { timeout: 8000 });
  63  | 
  64  |   // Click view/details link or button inside the notification.
  65  |   const detailTrigger = inviteNotification
  66  |     .getByRole('link', { name: /view|details|open/i })
  67  |     .or(inviteNotification.getByRole('button', { name: /view|details|open/i }));
  68  | 
  69  |   await detailTrigger.click();
  70  |   await expect(page.getByText(GROUP_NAME)).toBeVisible({ timeout: 5000 });
  71  | }
  72  | 
  73  | // ─────────────────────────────────────────────────────────────────────────────
  74  | // Test 1: Invitee accepts and sees status change to ACCEPTED
  75  | // ─────────────────────────────────────────────────────────────────────────────
  76  | 
  77  | test('invitee accepts invitation and sees status change to ACCEPTED', async ({ page }) => {
  78  |   await setupInvitation(page);
  79  | 
  80  |   // Log in as invitee.
  81  |   await loginAs(page, INVITEE.studentId, INVITEE.password);
  82  |   await openInvitationDetail(page);
  83  | 
  84  |   // Accept button must be present.
  85  |   const acceptButton = page.getByRole('button', { name: /accept/i });
  86  |   await expect(acceptButton).toBeVisible({ timeout: 5000 });
  87  |   await acceptButton.click();
  88  | 
  89  |   // After accepting, status badge/text must show ACCEPTED.
  90  |   await expect(
  91  |     page.getByText(/accepted/i),
  92  |   ).toBeVisible({ timeout: 5000 });
  93  | 
  94  |   // Accept button must disappear — invitation already responded to.
  95  |   await expect(acceptButton).not.toBeVisible({ timeout: 3000 });
  96  | 
  97  |   // Decline button must also disappear.
  98  |   await expect(
  99  |     page.getByRole('button', { name: /decline|reject/i }),
  100 |   ).not.toBeVisible({ timeout: 3000 });
  101 | });
  102 | 
  103 | // ─────────────────────────────────────────────────────────────────────────────
  104 | // Test 2: Invitee declines and sees status change to REJECTED
  105 | // ─────────────────────────────────────────────────────────────────────────────
  106 | 
  107 | test('invitee declines invitation and sees status change to REJECTED', async ({ page }) => {
  108 |   await setupInvitation(page);
  109 | 
  110 |   await loginAs(page, INVITEE.studentId, INVITEE.password);
  111 |   await openInvitationDetail(page);
  112 | 
  113 |   const declineButton = page.getByRole('button', { name: /decline|reject/i });
  114 |   await expect(declineButton).toBeVisible({ timeout: 5000 });
  115 |   await declineButton.click();
  116 | 
  117 |   // After declining, status badge/text must show REJECTED or DECLINED.
  118 |   await expect(
  119 |     page.getByText(/rejected|declined/i),
  120 |   ).toBeVisible({ timeout: 5000 });
  121 | 
  122 |   // Both action buttons must disappear.
```