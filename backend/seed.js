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
  GradingRubric,
  SprintWeightConfiguration,
  SprintPullRequest,
  AIValidationResult,
  MemberFinalGrade,
  TeamScalar,
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
  for (const a of ADMINS) await upsertUser(a);
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

  console.log('▸ Seeding deliverable');
  let deliverable = await Deliverable.findOne({ where: { groupId: group.id, type: 'PROPOSAL' } });
  if (!deliverable) {
    deliverable = await Deliverable.create({
      groupId: group.id,
      type: 'PROPOSAL',
      content: '## Proposal\n\nDemo proposal content.',
      images: [],
      status: 'SUBMITTED',
      version: 1,
    });
  }

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

  console.log('▸ Seeding sample sprint pull requests');
  for (const pr of [
    { prNumber: 101, relatedIssueKey: 'DEMO-1', title: 'Implement login flow', reviewVerified: 'REVIEWED', reviewConfidence: 0.91 },
    { prNumber: 102, relatedIssueKey: 'DEMO-2', title: 'Add dashboard skeleton', reviewVerified: 'NOT_REVIEWED', reviewConfidence: 0.78 },
    { prNumber: 103, relatedIssueKey: 'DEMO-3', title: 'Wire AI validation panel', reviewVerified: 'PENDING', reviewConfidence: null },
  ]) {
    const exists = await SprintPullRequest.findOne({
      where: { teamId: TEAM_ID, sprintId: SPRINT_ID, prNumber: pr.prNumber },
    });
    if (exists) continue;
    await SprintPullRequest.create({
      teamId: TEAM_ID,
      sprintId: SPRINT_ID,
      prNumber: pr.prNumber,
      relatedIssueKey: pr.relatedIssueKey,
      branchName: `feature/${pr.relatedIssueKey}`,
      title: pr.title,
      prStatus: 'MERGED',
      mergeStatus: 'MERGED',
      changedFiles: ['src/file.js'],
      diffSummary: pr.title,
      isActive: true,
      reviewVerified: pr.reviewVerified,
      reviewConfidence: pr.reviewConfidence,
      reviewVerifiedAt: pr.reviewVerified === 'PENDING' ? null : new Date(),
    });
  }

  // Group 1 (Demo Senior Project Group) is left UN-finalised so the advisor /
  // committee / coordinator grading flow can be exercised against it.
  // Group 2 (Demo Project Group Two) is fully finalised so /my-grade returns
  // a real grade for student2 / leader2.
  console.log('▸ Seeding finalised state for groupTwo (so /my-grade returns 200)');
  const activeWeights = await FinalEvaluationWeight.findOne({ where: { isActive: true } });
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
  for (const member of [leaderTwo, studentTwo]) {
    const exists = await MemberFinalGrade.findOne({
      where: { groupId: groupTwo.id, userId: member.id },
    });
    if (!exists) {
      await MemberFinalGrade.create({
        groupId: groupTwo.id,
        userId: member.id,
        teamScalar: 82,
        contributionRatio: 50,
        finalScore: 41,
        letterGrade: 'F',
        finalizedAt: new Date(),
      });
    }
  }

  console.log('▸ Seeding sample AI validation results');
  for (const v of [
    { issueKey: 'DEMO-1', validationStatus: 'MATCHED', confidence: 0.92, feedback: 'Login flow fully implemented.' },
    { issueKey: 'DEMO-2', validationStatus: 'PARTIAL_MATCH', confidence: 0.55, feedback: 'Skeleton present, navigation missing.' },
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
