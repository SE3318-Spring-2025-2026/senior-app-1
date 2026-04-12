# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: QA.spec.js >> non-invitee cannot see or respond to the invitation
- Location: src/QA.spec.js:134:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel(/student id/i)

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e4]:
      - link "Senior App" [ref=e5] [cursor=pointer]:
        - /url: /
      - navigation "Primary" [ref=e6]:
        - link "Entry" [ref=e7] [cursor=pointer]:
          - /url: /
        - link "Student Login" [ref=e8] [cursor=pointer]:
          - /url: /students/login
        - link "Student Register" [ref=e9] [cursor=pointer]:
          - /url: /students/register
        - link "Professor Login" [ref=e10] [cursor=pointer]:
          - /url: /professors/login
        - link "Coordinator Login" [ref=e11] [cursor=pointer]:
          - /url: /coordinator/login
        - link "Admin Login" [ref=e12] [cursor=pointer]:
          - /url: /admin/login
  - main [ref=e13]:
    - generic [ref=e14]:
      - paragraph [ref=e15]: Senior App Access
      - heading "Welcome to Senior App" [level=1] [ref=e16]
      - paragraph [ref=e17]: The system has separate student, professor, and admin-facing auth flows. This landing page keeps those routes visible and easy to demo without mixing the screens together.
    - generic [ref=e18]:
      - article [ref=e19]:
        - paragraph [ref=e20]: Student
        - generic [ref=e21]:
          - heading "Student Login" [level=2] [ref=e22]
          - generic [ref=e23]: Planned
        - paragraph [ref=e24]: Returning students sign in here before continuing with team, GitHub, and sprint workflows.
        - link "Open Student Login" [ref=e25] [cursor=pointer]:
          - /url: /students/login
      - article [ref=e26]:
        - paragraph [ref=e27]: Student
        - generic [ref=e28]:
          - heading "Student Register" [level=2] [ref=e29]
          - generic [ref=e30]: Ready
        - paragraph [ref=e31]: New students validate their uploaded student ID and create their base account here.
        - link "Open Student Register" [ref=e32] [cursor=pointer]:
          - /url: /students/register
      - article [ref=e33]:
        - paragraph [ref=e34]: Professor
        - generic [ref=e35]:
          - heading "Professor Login" [level=2] [ref=e36]
          - generic [ref=e37]: Planned
        - paragraph [ref=e38]: Professors authenticate here after completing their initial password setup flow.
        - link "Open Professor Login" [ref=e39] [cursor=pointer]:
          - /url: /professors/login
      - article [ref=e40]:
        - paragraph [ref=e41]: Professor
        - generic [ref=e42]:
          - heading "Professor Initial Password" [level=2] [ref=e43]
          - generic [ref=e44]: Ready
        - paragraph [ref=e45]: A newly created professor account completes its first-time password setup here.
        - link "Open Password Setup" [ref=e46] [cursor=pointer]:
          - /url: /professors/password-setup
      - article [ref=e47]:
        - paragraph [ref=e48]: Coordinator
        - generic [ref=e49]:
          - heading "Coordinator Login" [level=2] [ref=e50]
          - generic [ref=e51]: Ready
        - paragraph [ref=e52]: Coordinators sign in here before accessing coordinator workspace tools such as student ID import.
        - link "Open Coordinator Login" [ref=e53] [cursor=pointer]:
          - /url: /coordinator/login
      - article [ref=e54]:
        - paragraph [ref=e55]: Admin
        - generic [ref=e56]:
          - heading "Admin Login" [level=2] [ref=e57]
          - generic [ref=e58]: Ready
        - paragraph [ref=e59]: Admins sign in here before accessing admin-only tools such as professor account registration.
        - link "Open Admin Login" [ref=e60] [cursor=pointer]:
          - /url: /admin/login
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
  22  |   await page.goto('/student/login');
> 23  |   await page.getByLabel(/student id/i).fill(studentId);
      |                                        ^ Error: locator.fill: Test timeout of 30000ms exceeded.
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
  123 |   await expect(
```