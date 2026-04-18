/**
 * Issue #93 — D2 repository only (no HTTP). Run with: npm test (see package.json).
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const sequelize = require('../db');
require('../models');
const { User, Group } = require('../models');
const groupsRepository = require('../repositories/groupsRepository');
const { createStudent, ensureValidStudentRegistry } = require('../services/studentService');

test.before(async () => {
  await sequelize.sync({ force: true });
  await ensureValidStudentRegistry();
});

test.after(async () => {
  await sequelize.close();
});

test.beforeEach(async () => {
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('GroupsRepository: idempotent ADD, REMOVE member, leader REMOVE blocked, runWithGroupRowLocked', async () => {
  await createStudent({
    studentId: '11070001000',
    email: 'lead-repo@example.edu',
    fullName: 'Leader Repo',
    password: 'StrongPass1!',
  });
  await createStudent({
    studentId: '11070001001',
    email: 'member-repo@example.edu',
    fullName: 'Member Repo',
    password: 'StrongPass1!',
  });

  await Group.create({
    id: 'grp-issue-93',
    name: 'D2 Test',
    leaderId: '11070001000',
    memberIds: ['11070001000'],
  });

  let g = await groupsRepository.applyCoordinatorChange('grp-issue-93', 'ADD', '11070001001');
  assert.ok(g.memberIds.includes('11070001001'));

  g = await groupsRepository.applyCoordinatorChange('grp-issue-93', 'ADD', '11070001001');
  assert.equal(g.memberIds.filter((id) => id === '11070001001').length, 1);

  g = await groupsRepository.applyCoordinatorChange('grp-issue-93', 'REMOVE', '11070001001');
  assert.ok(!g.memberIds.includes('11070001001'));

  await assert.rejects(
    () => groupsRepository.applyCoordinatorChange('grp-issue-93', 'REMOVE', '11070001000'),
    (err) => err.code === groupsRepository.CODES.LEADER_REMOVAL_REQUIRES_REASSIGNMENT,
  );

  const locked = await groupsRepository.runWithGroupRowLocked('grp-issue-93', async (group) => group.id);
  assert.equal(locked, 'grp-issue-93');
});
