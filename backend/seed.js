'use strict';

/**
 * Seed script — populates the database with a working demo dataset.
 *
 * Usage:
 *   node seed.js          # additive (skips rows that already exist)
 *   node seed.js --reset  # drops and recreates all tables first
 *
 * Works against whichever database backend/db.js resolves to
 * (DATABASE_URL → Postgres, otherwise local SQLite).
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const sequelize = require('./db');
const {
  User,
  ValidStudentId,
  Group,
  GroupAdvisorAssignment,
  Deliverable,
  Professor,
  IntegrationBinding,
  IntegrationTokenReference,
  FinalEvaluationWeight,
  FinalEvaluationGrade,
  GradingRubric,
  SprintWeightConfiguration,
  SprintPullRequest,
  AIValidationResult,
  MemberFinalGrade,
  TeamScalar,
  AdvisorRequest,
  Invitation,
  AuditLog,
  Notification,
  CommitteeReview,
  Grade,
  SprintStory,
  StoryMetric,
  PrMetric,
  SprintMemberRecord,
  LinkedGitHubAccount,
} = require('./models');

const RESET = process.argv.includes('--reset');

// One simple password for every demo account so docs/PASSWORDS.md stays short.
// Matches the policy in studentService.js: ≥8 chars + lower + upper + digit + symbol.
const PASSWORD = 'Demo1234!';

const ADMINS = [
  { email: 'admin1@demo.edu', fullName: 'Admin One', role: 'ADMIN' },
  { email: 'admin2@demo.edu', fullName: 'Admin Two', role: 'ADMIN' },
];
const COORDINATORS = [
  { email: 'coordinator1@demo.edu', fullName: 'Coordinator One', role: 'COORDINATOR' },
  { email: 'coordinator2@demo.edu', fullName: 'Coordinator Two', role: 'COORDINATOR' },
];
// Advisors and committee members are both just PROFESSOR rows in the DB —
// the seed simply wires the first two as advisors and leaves the other two
// as plain professors who show up in the committee-review queue. No DB
// distinction.
const ADVISORS = [
  { email: 'advisor1@demo.edu', fullName: 'Professor One', role: 'PROFESSOR' },
  { email: 'advisor2@demo.edu', fullName: 'Professor Two', role: 'PROFESSOR' },
];
const COMMITTEE = [
  { email: 'committee1@demo.edu', fullName: 'Professor Three', role: 'PROFESSOR' },
  { email: 'committee2@demo.edu', fullName: 'Professor Four', role: 'PROFESSOR' },
];
// Team leaders are Students who created a group (granted by membership-role logic,
// not by a different DB role). The seed creates two groups, one per leader.
const TEAM_LEADERS = [
  { studentId: '11070001000', email: 'leader1@demo.edu', fullName: 'Leader Leo', role: 'STUDENT' },
  { studentId: '11070001001', email: 'leader2@demo.edu', fullName: 'Leader Lina', role: 'STUDENT' },
];
const STUDENTS = [
  { studentId: '11070001002', email: 'student1@demo.edu', fullName: 'Student Sam', role: 'STUDENT' },
  { studentId: '11070001003', email: 'student2@demo.edu', fullName: 'Student Sofia', role: 'STUDENT' },
  // Six extra students that populate three additional graded groups so the
  // My Grade page has working examples across letter grades A / B / F.
  { studentId: '11070001004', email: 'student3@demo.edu', fullName: 'Ada Stellar',     role: 'STUDENT' },
  { studentId: '11070001005', email: 'student4@demo.edu', fullName: 'Ben Stellar',     role: 'STUDENT' },
  { studentId: '11070001006', email: 'student5@demo.edu', fullName: 'Cara Solid',      role: 'STUDENT' },
  { studentId: '11070001007', email: 'student6@demo.edu', fullName: 'Dan Solid',       role: 'STUDENT' },
  { studentId: '11070001008', email: 'student7@demo.edu', fullName: 'Eve Struggling',  role: 'STUDENT' },
  { studentId: '11070001009', email: 'student8@demo.edu', fullName: 'Finn Struggling', role: 'STUDENT' },
];

const TEAM_ID = 'team-demo-001';
const SPRINT_ID = 'sprint-2026-05';

async function upsertUser(payload) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = await User.findOne({ where: { email: payload.email } });
  if (existing) {
    // Refresh display name + role + password hash on every run so seed edits
    // (rename "Committee Bob" → "Professor Three", role tweaks, password
    // changes) propagate without needing --reset.
    const patch = {};
    if (payload.fullName && existing.fullName !== payload.fullName) patch.fullName = payload.fullName;
    if (payload.role && existing.role !== payload.role) patch.role = payload.role;
    if (payload.studentId && existing.studentId !== payload.studentId) patch.studentId = payload.studentId;
    // Keep password aligned so the demo password always works.
    patch.password = hash;
    patch.passwordHash = hash;
    if (existing.status !== 'ACTIVE') patch.status = 'ACTIVE';
    if (Object.keys(patch).length) await existing.update(patch);
    return existing;
  }
  // Both `password` (used by admin/coordinator/professor login) and
  // `passwordHash` (used by student login) need the same bcrypt hash so every
  // login flow accepts the demo password.
  return User.create({
    ...payload,
    status: 'ACTIVE',
    password: hash,
    passwordHash: hash,
  });
}

async function upsertValidStudentId(studentId) {
  const existing = await ValidStudentId.findOne({ where: { studentId } });
  if (existing) return existing;
  return ValidStudentId.create({ studentId });
}

async function ensureProfessorRecord(user) {
  if (user.role !== 'PROFESSOR') return;
  const existing = await Professor.findOne({ where: { userId: user.id } });
  if (existing) return existing;
  return Professor.create({
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
    department: 'Computer Engineering',
  });
}

async function main() {
  console.log('▸ Connecting to database…');
  await sequelize.authenticate();

  if (RESET) {
    console.log('▸ --reset given: dropping & recreating all tables');
    // Plain sync({ force: true }) leaves orphan ENUM types and indexes on
    // Postgres, which then collide on the next CREATE TABLE. Drop the whole
    // public schema and let sync() recreate everything from scratch.
    if (sequelize.getDialect() === 'postgres') {
      await sequelize.query('DROP SCHEMA IF EXISTS public CASCADE');
      await sequelize.query('CREATE SCHEMA public');
      await sequelize.query('GRANT ALL ON SCHEMA public TO public');
    }
    await sequelize.sync({ force: true });
  }
  // Without --reset, assume schema already exists. (Re-running sync against
  // Postgres tries to re-create indexes and fails with 42P07.)

  console.log('▸ Seeding users');
  const admins = [];
  for (const a of ADMINS) admins.push(await upsertUser(a));
  const coordinators = [];
  for (const c of COORDINATORS) coordinators.push(await upsertUser(c));
  const advisors = [];
  for (const p of ADVISORS) {
    const user = await upsertUser(p);
    await ensureProfessorRecord(user);
    advisors.push(user);
  }
  const committee = [];
  for (const p of COMMITTEE) {
    const user = await upsertUser(p);
    await ensureProfessorRecord(user);
    committee.push(user);
  }
  const leaders = [];
  for (const s of TEAM_LEADERS) {
    await upsertValidStudentId(s.studentId);
    leaders.push(await upsertUser({ ...s, studentId: s.studentId }));
  }
  const regularStudents = [];
  for (const s of STUDENTS) {
    await upsertValidStudentId(s.studentId);
    regularStudents.push(await upsertUser({ ...s, studentId: s.studentId }));
  }

  const [advisor, advisorTwo] = advisors;
  const [leader, leaderTwo] = leaders;
  const [studentOne, studentTwo] = regularStudents;
  const coordinator = coordinators[0];

  console.log('▸ Seeding groups');
  let group = await Group.findOne({ where: { name: 'Demo Senior Project Group' } });
  if (!group) {
    group = await Group.create({
      id: TEAM_ID,
      name: 'Demo Senior Project Group',
      leaderId: String(leader.id),
      memberIds: [leader, studentOne].map((u) => String(u.id)),
      status: 'HAS_ADVISOR',
      maxMembers: 4,
    });
  }
  // Second demo group for leader2 + student2 + advisor2.
  let groupTwo = await Group.findOne({ where: { name: 'Demo Project Group Two' } });
  if (!groupTwo) {
    groupTwo = await Group.create({
      id: 'team-demo-002',
      name: 'Demo Project Group Two',
      leaderId: String(leaderTwo.id),
      memberIds: [leaderTwo, studentTwo].map((u) => String(u.id)),
      status: 'HAS_ADVISOR',
      maxMembers: 4,
    });
  }

  console.log('▸ Seeding advisor assignments');
  for (const [g, lead, adv] of [
    [group, leader, advisor],
    [groupTwo, leaderTwo, advisorTwo],
  ]) {
    const existing = await GroupAdvisorAssignment.findOne({
      where: { groupId: g.id, advisorUserId: adv.id },
    });
    if (!existing) {
      await GroupAdvisorAssignment.create({
        groupId: g.id,
        studentUserId: lead.id,
        advisorUserId: adv.id,
        status: 'ACTIVE',
      });
    }
  }

  console.log('▸ Seeding deliverables (multiple so the queue is never empty)');
  // Always-present pending submissions for the committee-review demo:
  //   • PROPOSAL for group 1 (Demo Senior Project Group)
  //   • SOW      for group 1
  //   • PROPOSAL for group 2 (Demo Project Group Two)
  // Each is freshly SUBMITTED — earlier graded states are wiped by --reset.
  const deliverableSeeds = [
    {
      groupId: group.id,
      type: 'PROPOSAL',
      content: '## Proposal — Demo Senior Project Group\n\nA short demo proposal explaining what the group plans to build.',
    },
    {
      groupId: group.id,
      type: 'SOW',
      content: '## Statement of Work — Demo Senior Project Group\n\nMilestones, sprint plan, and division of labour.',
    },
    {
      groupId: groupTwo.id,
      type: 'PROPOSAL',
      content: '## Proposal — Demo Project Group Two\n\nSecond demo proposal so the pending queue is never empty.',
    },
  ];

  for (const d of deliverableSeeds) {
    const exists = await Deliverable.findOne({ where: { groupId: d.groupId, type: d.type } });
    if (exists) {
      // Reset status so a previously-graded deliverable comes back to the
      // pending queue on every --reset / dev restart.
      await exists.update({ status: 'SUBMITTED', content: d.content, version: 1 });
      continue;
    }
    await Deliverable.create({
      groupId: d.groupId,
      type: d.type,
      content: d.content,
      images: [],
      status: 'SUBMITTED',
      version: 1,
    });
  }
  const deliverable = await Deliverable.findOne({ where: { groupId: group.id, type: 'PROPOSAL' } });

  console.log('▸ Seeding default rubric (PROPOSAL + SOW)');
  for (const deliverableType of ['PROPOSAL', 'SOW']) {
    const exists = await GradingRubric.findOne({ where: { deliverableType } });
    if (exists) continue;
    await GradingRubric.create({
      deliverableType,
      updatedBy: coordinator.id,
      criteria: [
        {
          id: `${deliverableType.toLowerCase()}-clarity`,
          name: 'Document clarity & structure',
          question: 'Is the document clearly written and well-structured?',
          criterionType: 'SOFT',
          maxPoints: 25,
          weight: 0.25,
        },
        {
          id: `${deliverableType.toLowerCase()}-completeness`,
          name: 'Completeness',
          question: 'Does it cover every required section?',
          criterionType: 'SOFT',
          maxPoints: 30,
          weight: 0.3,
        },
        {
          id: `${deliverableType.toLowerCase()}-feasibility`,
          name: 'Sprint feasibility',
          question: 'Is the proposed work feasible within the sprint plan?',
          criterionType: 'SOFT',
          maxPoints: 15,
          weight: 0.15,
        },
        {
          id: `${deliverableType.toLowerCase()}-references`,
          name: 'References & citations',
          question: 'Are references and citations correct?',
          criterionType: 'BINARY',
          maxPoints: 10,
          weight: 0.1,
        },
        {
          id: `${deliverableType.toLowerCase()}-github`,
          name: 'GitHub activity (AI-graded)',
          question: 'Did the team\'s GitHub PRs and reviews demonstrate solid engineering practice (substantive reviews, PRs that actually implement their issues)?',
          criterionType: 'GITHUB_LLM',
          maxPoints: 20,
          weight: 0.2,
        },
      ],
    });
  }

  console.log('▸ Seeding final-evaluation weight config');
  const weights = await FinalEvaluationWeight.findOne({ where: { isActive: true } });
  if (!weights) {
    await FinalEvaluationWeight.create({
      advisorWeight: 0.4,
      committeeWeight: 0.6,
      updatedBy: coordinator.id,
      isActive: true,
    });
  }

  console.log('▸ Seeding integration binding');
  const binding = await IntegrationBinding.findOne({ where: { teamId: TEAM_ID } });
  if (!binding) {
    await IntegrationBinding.create({
      teamId: TEAM_ID,
      providerSet: ['GITHUB', 'JIRA'],
      status: 'ACTIVE',
      organizationName: 'demo-org',
      repositoryName: 'demo-repo',
      jiraProjectKey: 'DEMO',
      jiraWorkspaceId: 'demo-workspace',
      jiraUserEmail: 'leader1@demo.edu',
      initiatedBy: String(leader.id),
    });
    await IntegrationTokenReference.create({
      teamId: TEAM_ID,
      githubTokenRef: 'vault://demo/github',
      jiraTokenRef: 'vault://demo/jira',
    });
  }

  // Real PR data pulled from this very repo (SE3318-Spring-2025-2026/senior-app-1).
  // Using the first 3 PRs and the first 3 issues so the demo reflects what
  // the team actually shipped. Branch names + URLs are real; `relatedIssueKey`
  // matches the linked issue number.
  console.log('▸ Seeding sample sprint pull requests (real PRs from this repo)');
  const realPrs = [
    {
      prNumber: 433,
      relatedIssueKey: '432',
      title: 'Minor changes',
      branchName: '432-bug-fix-ui-implementation-and-process-fixes',
      url: 'https://github.com/SE3318-Spring-2025-2026/senior-app-1/pull/433',
      diffSummary: {
        author: 'DinVisel (Arda Özcan)',
        body: 'Bug fixes applied.',
        createdAt: '2026-05-09T10:08:30Z',
        mergedAt: null,
        changedLineSample: '+ /* bugfix: form-submit handler reset state on success */\n- if (state==="GRADED") return;',
      },
      changedFiles: ['frontend/src/CommitteeGradingPage.jsx', 'frontend/src/StudentGroupShellPage.jsx'],
      prStatus: 'CLOSED',
      mergeStatus: 'CLOSED',
      reviewVerified: 'NOT_REVIEWED',
      reviewConfidence: 0.55,
      reviewReasoning: 'PR was closed without merge; review activity could not be verified.',
    },
    {
      prNumber: 429,
      relatedIssueKey: '430',
      title: 'docs: update password reset API documentation',
      branchName: 'password-reset-api-spec-docs',
      url: 'https://github.com/SE3318-Spring-2025-2026/senior-app-1/pull/429',
      diffSummary: {
        author: 'cangere (Can Gere)',
        body: [
          '## Summary',
          '- Document admin-generated one-time password reset links',
          '- Add `/api/v1/admin/users/{userId}/password-reset-link` to API specs',
          '- Add `/api/v1/auth/reset-password` to API specs',
          '- Document reset token hashing, expiration, one-time use, sibling token invalidation, and JWT/session invalidation behavior',
          '- Update README with password reset flow details and test guidance',
          '',
          '## Testing',
          '- Docs-only change',
          '- Verified old `/admin/reset-link` reference was removed from API specs',
        ].join('\n'),
        createdAt: '2026-05-08T22:32:51Z',
        mergedAt: null,
        changedLineSample: '+ /api/v1/admin/users/{userId}/password-reset-link:\n+   post: ... summary: Generate one-time reset link',
      },
      changedFiles: ['docs/api_specification.yaml', 'docs/README.md'],
      prStatus: 'OPEN',
      mergeStatus: 'MERGEABLE',
      reviewVerified: 'PENDING',
      reviewConfidence: null,
      reviewReasoning: null,
    },
    {
      prNumber: 428,
      relatedIssueKey: '430',
      title: 'feat(admin): add one-time password reset links',
      branchName: 'feature/add-password-reset-link',
      url: 'https://github.com/SE3318-Spring-2025-2026/senior-app-1/pull/428',
      diffSummary: {
        author: 'cangere (Can Gere)',
        body: [
          '## What this PR does',
          '',
          'Adds an admin-generated, one-time-use password reset flow for registered users.',
          'Admins can generate reset links by user ID, and users can set a new password',
          'through a public reset page. Tokens are stored hashed, expire automatically,',
          'and are invalidated after successful use.',
          '',
          '## Files added / changed',
          '- backend/models/PasswordResetToken.js  — store hashed reset tokens',
          '- backend/services/passwordResetService.js — generate, validate, consume',
          '- backend/controllers/passwordResetController.js — HTTP handlers',
          '- backend/routes/admin.js — admin-only reset link endpoint',
          '- backend/routes/auth.js — public password reset endpoint',
          '- backend/test/passwordReset.test.js — generation, reset, reuse, expiry, auth tests',
          '- frontend/src/AdminPasswordResetLinkPage.jsx — admin UI',
          '- frontend/src/ResetPasswordPage.jsx — public password reset form',
          '',
          '## How to test',
          'cd backend && JWT_SECRET=test-backend-jwt-not-for-production node --test test/passwordReset.test.js',
        ].join('\n'),
        createdAt: '2026-05-08T12:40:23Z',
        mergedAt: '2026-05-08T22:22:27Z',
        changedLineSample: '+ const { token, expiresAt } = await passwordResetService.create(...)\n+ res.status(201).json({ resetLink: ... })',
      },
      changedFiles: [
        'backend/models/PasswordResetToken.js',
        'backend/services/passwordResetService.js',
        'backend/controllers/passwordResetController.js',
        'backend/routes/admin.js',
        'backend/routes/auth.js',
        'backend/test/passwordReset.test.js',
        'frontend/src/AdminPasswordResetLinkPage.jsx',
        'frontend/src/ResetPasswordPage.jsx',
      ],
      prStatus: 'MERGED',
      mergeStatus: 'MERGED',
      reviewVerified: 'REVIEWED',
      reviewConfidence: 0.92,
      reviewReasoning: 'Reviewer left detailed substantive feedback before merge.',
    },
  ];
  for (const pr of realPrs) {
    const exists = await SprintPullRequest.findOne({
      where: { teamId: TEAM_ID, sprintId: SPRINT_ID, prNumber: pr.prNumber },
    });
    if (exists) continue;
    await SprintPullRequest.create({
      teamId: TEAM_ID,
      sprintId: SPRINT_ID,
      ...pr,
      isActive: true,
      reviewVerifiedAt: pr.reviewVerified === 'PENDING' ? null : new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Three EXTRA finalised groups so the My Grade page has working examples
  // across letter grades A / B / F. Each group has its own 2 students, an
  // advisor, a deliverable, a TeamScalar, and MemberFinalGrade rows.
  // ────────────────────────────────────────────────────────────────────────
  console.log('▸ Seeding three more finalised groups (A / B / F)');
  const activeWeights = await FinalEvaluationWeight.findOne({ where: { isActive: true } });
  const stellarMembers = [regularStudents[2], regularStudents[3]];      // Ada, Ben
  // The Solid group is the "everyone gets the same grade" showcase: all
  // 10 demo students are listed as members and given contributionRatio
  // 100, so every member's individual grade collapses onto the team
  // scalar (84 / B). The /my-grade endpoint prefers the MemberFinalGrade
  // row over the user's primary group, so even Leo & Sam (still primarily
  // in team-demo-001) see this B grade.
  const solidMembers   = [
    regularStudents[4], regularStudents[5],   // Cara, Dan (originals)
    leader, studentOne,                       // Leo, Sam (group 1)
    leaderTwo, studentTwo,                    // Lina, Sofia (group 2)
    regularStudents[2], regularStudents[3],   // Ada, Ben
    regularStudents[6], regularStudents[7],   // Eve, Finn
  ];
  const strugglingMembers = [regularStudents[6], regularStudents[7]];   // Eve, Finn

  // Note: contributionRatio is each member's completion %, not their share
  // of the team's total work. Formula: finalScore = min(100, teamScalar * ratio / 100).
  // So ratio=100 means "did all assigned work" → individual ≈ teamScalar.
  const extraGroupSpecs = [
    {
      id: 'team-demo-stellar',
      name: 'Stellar Performers (A)',
      members: stellarMembers,
      advisor: advisor,            // Professor One
      teamScalar: 95, advisorScore: 96, committeeScore: 94,
      ratios: [100, 95],           // first did all, second a tiny bit less
      letter: 'A',
    },
    {
      id: 'team-demo-solid',
      name: 'Solid Engineers (B — every member gets the same grade)',
      members: solidMembers,
      advisor: advisorTwo,         // Professor Two
      teamScalar: 84, advisorScore: 80, committeeScore: 86,
      // Equal-contribution showcase: every member did 100% of their assigned
      // work, so every member's individual grade collapses onto the team
      // scalar. Use this group when you want to demo "team did B work →
      // everyone gets the same B".
      ratios: solidMembers.map(() => 100),
      letter: 'B',
    },
    {
      id: 'team-demo-struggling',
      name: 'Struggling Squad (D/F)',
      members: strugglingMembers,
      advisor: advisor,
      teamScalar: 65, advisorScore: 62, committeeScore: 67,
      ratios: [90, 60],            // Eve almost finished, Finn slacked
      letter: 'D',
    },
  ];

  for (const spec of extraGroupSpecs) {
    let extraGroup = await Group.findOne({ where: { id: spec.id } });
    if (!extraGroup) {
      extraGroup = await Group.create({
        id: spec.id,
        name: spec.name,
        leaderId: String(spec.members[0].id),
        memberIds: spec.members.map((u) => String(u.id)),
        status: 'FINALIZED',
        maxMembers: 4,
      });
    }

    // Advisor assignment
    const aaExists = await GroupAdvisorAssignment.findOne({
      where: { groupId: spec.id, advisorUserId: spec.advisor.id },
    });
    if (!aaExists) {
      await GroupAdvisorAssignment.create({
        groupId: spec.id,
        studentUserId: spec.members[0].id,
        advisorUserId: spec.advisor.id,
        status: 'ACTIVE',
      });
    }

    // Deliverable so the grading pipeline has something to anchor to
    const delExists = await Deliverable.findOne({ where: { groupId: spec.id, type: 'PROPOSAL' } });
    if (!delExists) {
      await Deliverable.create({
        groupId: spec.id,
        type: 'PROPOSAL',
        content: `## Proposal — ${spec.name}\n\nSeed deliverable.`,
        images: [],
        status: 'GRADED',
        version: 1,
      });
    }

    // TeamScalar (uses active weight config)
    const tsExists = await TeamScalar.findOne({ where: { groupId: spec.id } });
    if (!tsExists && activeWeights) {
      await TeamScalar.create({
        groupId: spec.id,
        scalar: spec.teamScalar,
        advisorFinalScore: spec.advisorScore,
        committeeFinalScore: spec.committeeScore,
        weightConfigId: activeWeights.id,
        calculatedAt: new Date(),
      });
    }

    // MemberFinalGrade per member
    for (let i = 0; i < spec.members.length; i++) {
      const member = spec.members[i];
      const ratio = spec.ratios[i];
      const finalScore = parseFloat(Math.min(100, spec.teamScalar * ratio / 100).toFixed(2));
      const exists = await MemberFinalGrade.findOne({
        where: { groupId: spec.id, userId: member.id },
      });
      if (!exists) {
        await MemberFinalGrade.create({
          groupId: spec.id,
          userId: member.id,
          teamScalar: spec.teamScalar,
          contributionRatio: ratio,
          finalScore,
          letterGrade: finalScore >= 90 ? 'A' : finalScore >= 80 ? 'B' : finalScore >= 70 ? 'C' : finalScore >= 60 ? 'D' : 'F',
          finalizedAt: new Date(),
        });
      }
    }
  }

  // Group 1 (Demo Senior Project Group) is left UN-finalised so the advisor /
  // committee / coordinator grading flow can be exercised against it.
  // Group 2 (Demo Project Group Two) is fully finalised so /my-grade returns
  // a real grade for student2 / leader2.
  console.log('▸ Seeding finalised state for groupTwo (so /my-grade returns 200)');
  const tsExists = await TeamScalar.findOne({ where: { groupId: groupTwo.id } });
  if (!tsExists && activeWeights) {
    await TeamScalar.create({
      groupId: groupTwo.id,
      scalar: 82,
      advisorFinalScore: 80,
      committeeFinalScore: 84,
      weightConfigId: activeWeights.id,
      calculatedAt: new Date(),
    });
  }
  for (const [i, member] of [leaderTwo, studentTwo].entries()) {
    const exists = await MemberFinalGrade.findOne({
      where: { groupId: groupTwo.id, userId: member.id },
    });
    if (!exists) {
      // Both completed nearly all assigned work — each gets close to the
      // team scalar. Leader Lina did slightly more than Sofia.
      const ratio = i === 0 ? 100 : 90;
      const finalScore = parseFloat(Math.min(100, 82 * ratio / 100).toFixed(2));
      await MemberFinalGrade.create({
        groupId: groupTwo.id,
        userId: member.id,
        teamScalar: 82,
        contributionRatio: ratio,
        finalScore,
        letterGrade: finalScore >= 90 ? 'A' : finalScore >= 80 ? 'B' : finalScore >= 70 ? 'C' : finalScore >= 60 ? 'D' : 'F',
        finalizedAt: new Date(),
      });
    }
  }

  console.log('▸ Seeding sample AI validation results (against the real issues #430, #432)');
  for (const v of [
    {
      issueKey: '430',
      validationStatus: 'MATCHED',
      confidence: 0.9,
      feedback: 'AI-features PR fully implements the requested PR review verification + issue implementation validation flows; routes mounted, models registered, tests added.',
    },
    {
      issueKey: '432',
      validationStatus: 'PARTIAL_MATCH',
      confidence: 0.55,
      feedback: 'PR #433 closed without merge; UI fixes started but several reported issues remain unaddressed.',
    },
  ]) {
    const exists = await AIValidationResult.findOne({
      where: { teamId: TEAM_ID, sprintId: SPRINT_ID, issueKey: v.issueKey },
    });
    if (exists) continue;
    await AIValidationResult.create({
      teamId: TEAM_ID,
      sprintId: SPRINT_ID,
      issueKey: v.issueKey,
      validationStatus: v.validationStatus,
      confidence: v.confidence,
      feedback: v.feedback,
      validatedAt: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Extra seed data — populates every visible table so the UI flows are
  // exercisable end-to-end with no DB cross-checking required.
  // ────────────────────────────────────────────────────────────────────────

  console.log('▸ Seeding advisor requests');
  for (const r of [
    {
      id: crypto.randomUUID(),
      groupId: group.id,
      advisorId: advisor.id,
      teamLeaderId: leader.id,
      status: 'APPROVED',
      note: 'Initial advisor request — accepted, now seeded as the active assignment.',
      decidedAt: new Date(),
    },
    {
      id: crypto.randomUUID(),
      groupId: groupTwo.id,
      advisorId: advisorTwo.id,
      teamLeaderId: leaderTwo.id,
      status: 'PENDING',
      note: 'Demo pending advisor request for group 2 so the professor inbox has rows.',
    },
  ]) {
    const exists = await AdvisorRequest.findOne({ where: { groupId: r.groupId, advisorId: r.advisorId, status: r.status } });
    if (exists) continue;
    await AdvisorRequest.create(r);
  }

  console.log('▸ Seeding pending invitation');
  const invExists = await Invitation.findOne({ where: { groupId: group.id, inviteeId: studentTwo.id } });
  if (!invExists) {
    await Invitation.create({
      groupId: group.id,
      inviteeId: studentTwo.id,
      status: 'PENDING',
    });
  }

  console.log('▸ Seeding linked GitHub account for leader 1');
  const ghExists = await LinkedGitHubAccount.findOne({ where: { userId: leader.id } });
  if (!ghExists) {
    await LinkedGitHubAccount.create({
      userId: leader.id,
      githubId: '900100',
      githubUsername: 'leader-leo',
    });
  }

  console.log('▸ Seeding sprint stories (real GitHub issues #430, #431, #432 from this repo)');
  const stories = [
    {
      issueKey: '432',
      title: 'Bug Fix: UI Implementation and Process Fixes',
      description: [
        'This issue covers bug fixing and UI implementation corrections in the application. Tasks involved may include:',
        '',
        '- Resolving UI glitches and inconsistencies',
        '- Addressing user-reported interface bugs',
        '- Improving the process flow with respect to user experience',
        '- Ensuring all UI components work as intended on different devices',
        '',
        'If you encounter additional minor bugs or process-related issues in the UI, add them as comments to this issue for tracking and progress updates.',
        '',
        '— author: DinVisel (Arda Özcan)',
      ].join('\n'),
      status: 'IN_PROGRESS',
      storyPoints: 5,
      assigneeId: String(leader.id),
    },
    {
      issueKey: '431',
      title: 'feat: P5 – AI validates issue implementation from PR file diffs',
      description: [
        '## Summary',
        '',
        "The system sends the JIRA issue description and the PR's file diffs to the Claude AI service.",
        'The AI returns a verdict (MATCHED / PARTIAL_MATCH / NOT_MATCHED) with a confidence score and natural-language feedback.',
        'Results are forwarded to the sprint evaluation pipeline and stored for later aggregation.',
        '',
        'This implements Business Flows 13, 14, and 15 from docs/api_sprint_monitoring.yaml.',
        '',
        'Difficulty: 4',
        '',
        '## Acceptance criteria',
        '- POST /api/v1/teams/{teamId}/sprints/{sprintId}/ai-validations → 202 ACCEPTED',
        '- POST /internal/evaluations/validation-results → 201 (forward to pipeline)',
        '- POST /internal/sprint-sync/ai-validations → 201 (upsert)',
        '- GET /api/v1/teams/{teamId}/sprints/{sprintId}/ai-validations → 200',
        '- AuditLog entry AI_VALIDATION_STORED on persistence',
        '',
        '— author: HawkOsm (Osman Sahin Guler)',
      ].join('\n'),
      status: 'DONE',
      storyPoints: 8,
      assigneeId: String(studentOne.id),
    },
    {
      issueKey: '430',
      title: 'feat: AI features – PR review verification and issue implementation validation',
      description: [
        '## Summary',
        '',
        'Two AI-powered sprint monitoring features:',
        '',
        '1. PR Review Verification (Difficulty 3): For each sprint PR, fetch GitHub review comments and use AI to determine whether a genuine code review took place (REVIEWED / NOT_REVIEWED). Result stored on SprintPullRequest and exposed in Team Evaluation grading criteria.',
        '',
        '2. Issue Implementation Validation (Difficulty 4): Send the JIRA issue description and PR file diffs to Claude AI. The AI returns a verdict (MATCHED / PARTIAL_MATCH / NOT_MATCHED) with confidence and feedback.',
        '',
        'Both features require changes in Grading / Grading Criteria / Team Evaluation.',
        '',
        '— author: HawkOsm (Osman Sahin Guler)',
      ].join('\n'),
      status: 'DONE',
      storyPoints: 13,
      assigneeId: String(leader.id),
    },
  ];
  for (const s of stories) {
    const exists = await SprintStory.findOne({ where: { teamId: TEAM_ID, sprintId: SPRINT_ID, issueKey: s.issueKey } });
    if (exists) continue;
    await SprintStory.create({
      teamId: TEAM_ID,
      sprintId: SPRINT_ID,
      ...s,
      isActive: true,
    });
  }

  console.log('▸ Seeding sprint metrics (per-story + per-PR)');
  for (const s of stories) {
    const completed = s.status === 'DONE' ? 1 : 0;
    const exists = await StoryMetric.findOne({ where: { teamId: TEAM_ID, sprintId: SPRINT_ID, issueKey: s.issueKey, metricName: 'storyCompletionScore' } });
    if (!exists) {
      await StoryMetric.create({
        teamId: TEAM_ID, sprintId: SPRINT_ID,
        issueKey: s.issueKey,
        metricName: 'storyCompletionScore',
        metricValue: completed,
        unit: 'ratio',
      });
    }
  }
  for (const [prNumber, ratio] of [[428, 1.0], [429, 0.5], [433, 0.0]]) {
    const exists = await PrMetric.findOne({ where: { teamId: TEAM_ID, sprintId: SPRINT_ID, prNumber, metricName: 'prCompletionRatio' } });
    if (!exists) {
      await PrMetric.create({
        teamId: TEAM_ID, sprintId: SPRINT_ID, prNumber,
        metricName: 'prCompletionRatio',
        metricValue: ratio,
        unit: 'ratio',
      });
    }
  }

  console.log('▸ Seeding per-member sprint contribution records');
  for (const m of [
    { userId: leader.id,    storyPointsCompleted: 8, commitCount: 12 },
    { userId: studentOne.id, storyPointsCompleted: 3, commitCount: 4  },
  ]) {
    const exists = await SprintMemberRecord.findOne({ where: { groupId: group.id, userId: m.userId, sprintId: SPRINT_ID } });
    if (exists) continue;
    await SprintMemberRecord.create({ groupId: group.id, sprintId: SPRINT_ID, ...m });
  }

  console.log('▸ Seeding final-evaluation grades for group 2 (so team-scalar is computable)');
  const fegSeeds = [
    { gradeType: 'ADVISOR',   gradedBy: advisorTwo.id,    finalScore: 84, scores: [{ criterionId: 'overall', value: 84 }] },
    { gradeType: 'COMMITTEE', gradedBy: committee[0].id,  finalScore: 86, scores: [{ criterionId: 'overall', value: 86 }] },
    { gradeType: 'COMMITTEE', gradedBy: committee[1].id,  finalScore: 80, scores: [{ criterionId: 'overall', value: 80 }] },
  ];
  const groupTwoDeliverable = await Deliverable.findOne({ where: { groupId: groupTwo.id, type: 'PROPOSAL' } });
  for (const g of fegSeeds) {
    const exists = await FinalEvaluationGrade.findOne({
      where: { groupId: groupTwo.id, gradeType: g.gradeType, gradedBy: g.gradedBy, deliverableId: groupTwoDeliverable.id },
    });
    if (exists) continue;
    await FinalEvaluationGrade.create({
      groupId: groupTwo.id,
      deliverableId: groupTwoDeliverable.id,
      ...g,
      comments: `Seeded ${g.gradeType.toLowerCase()} grade for the demo.`,
    });
  }

  console.log('▸ Seeding committee review (in-progress) for group 2');
  const reviewExists = await CommitteeReview.findOne({ where: { submissionId: groupTwoDeliverable.id, reviewerId: committee[0].id } });
  if (!reviewExists) {
    await CommitteeReview.create({
      submissionId: groupTwoDeliverable.id,
      reviewerId: committee[0].id,
      scores: [
        { criterionId: 'proposal-clarity', value: 22 },
        { criterionId: 'proposal-completeness', value: 24 },
      ],
      comments: 'Started reviewing — clarity is solid, completeness needs another pass.',
      finalScore: 84.0,
    });
  }

  console.log('▸ Seeding sample standalone Grade row');
  const gradeExists = await Grade.findOne({ where: { gradeType: 'COMMITTEE_FINAL' } });
  if (!gradeExists) {
    await Grade.create({
      submissionId: groupTwoDeliverable.id,
      deliverableId: groupTwoDeliverable.id,
      gradedBy: committee[0].id,
      gradeType: 'COMMITTEE_FINAL',
      scores: [{ criterionId: 'overall', value: 84 }],
      finalScore: 84.0,
      comments: 'Seeded committee final grade for analytics demos.',
    });
  }

  console.log('▸ Seeding notifications');
  for (const n of [
    {
      userId: leader.id,
      type: 'GROUP_INVITE',
      payload: JSON.stringify({ groupName: group.name, role: 'LEADER' }),
      status: 'READ',
    },
    {
      userId: studentTwo.id,
      type: 'GROUP_INVITE',
      payload: JSON.stringify({ groupId: group.id, groupName: group.name, fromLeader: leader.fullName }),
      status: 'PENDING',
    },
    {
      userId: advisor.id,
      type: 'ADVISOR_REQUEST',
      payload: JSON.stringify({ groupId: group.id, groupName: group.name, leaderId: leader.id }),
      status: 'READ',
    },
  ]) {
    const exists = await Notification.findOne({ where: { userId: n.userId, type: n.type } });
    if (exists) continue;
    await Notification.create(n);
  }

  console.log('▸ Seeding audit log entries (so admin audit-log page has rows)');
  for (const a of [
    { action: 'LOGIN_SUCCESS',          actorId: admins[0].id,     targetType: 'USER',          targetId: String(admins[0].id) },
    { action: 'RUBRIC_UPDATED',         actorId: coordinator.id,   targetType: 'GRADING_RUBRIC', targetId: 'PROPOSAL' },
    { action: 'GRADE_SUBMITTED',        actorId: advisor.id,       targetType: 'GRADE',         targetId: 'demo-grade-1', metadata: { groupId: group.id, gradeType: 'ADVISOR' } },
    { action: 'AI_VALIDATION_STORED',   actorId: admins[0].id,     targetType: 'AI_VALIDATION_RESULT', targetId: '430' },
    { action: 'PR_REVIEW_VERIFIED',     actorId: admins[0].id,     targetType: 'SPRINT_PULL_REQUEST',   targetId: 'pr-428' },
  ]) {
    await AuditLog.create({ ...a, metadata: a.metadata || {} });
  }

  console.log('\n✓ Seed complete. All accounts share password: %s', PASSWORD);
  console.log('  • admins                  %s', ADMINS.map((u) => u.email).join(', '));
  console.log('  • coordinators            %s', COORDINATORS.map((u) => u.email).join(', '));
  console.log('  • professors (advisors)   %s', ADVISORS.map((u) => u.email).join(', '));
  console.log('  • professors (committee)  %s', COMMITTEE.map((u) => u.email).join(', '));
  console.log('  • team leaders            %s', TEAM_LEADERS.map((u) => u.email).join(', '));
  console.log('  • students                %s', STUDENTS.map((u) => u.email).join(', '));
  console.log('  Groups:   %s, %s', 'Demo Senior Project Group', 'Demo Project Group Two');
  console.log('  Sprint:   %s', SPRINT_ID);

  await sequelize.close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
