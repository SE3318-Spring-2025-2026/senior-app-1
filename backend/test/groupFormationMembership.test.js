const test = require('node:test');
const assert = require('node:assert/strict');

function createMockMembershipSystem() {
  const invitations = new Map();
  const memberships = new Set();
  let finalizeCallCount = 0;

  return {
    seedInvitation({ id, groupId, studentId, status = 'PENDING' }) {
      invitations.set(id, { id, groupId, studentId, status });
    },

    async finalizeMembership(groupId, studentId) {
      finalizeCallCount += 1;
      memberships.add(`${groupId}:${studentId}`);
    },

    async processResponse(invitationId, response) {
      const invitation = invitations.get(invitationId);
      if (!invitation) {
        throw new Error('INVITATION_NOT_FOUND');
      }

      if (!['ACCEPT', 'REJECT'].includes(response)) {
        throw new Error('INVALID_RESPONSE');
      }

      const nextStatus = response === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';

      if (invitation.status === 'PENDING') {
        invitation.status = nextStatus;
      } else if (invitation.status !== nextStatus) {
        throw new Error('INVITATION_ALREADY_RESOLVED');
      }

      if (nextStatus === 'ACCEPTED') {
        await this.finalizeMembership(invitation.groupId, invitation.studentId);
      }

      return { ...invitation };
    },

    getFinalizeCallCount() {
      return finalizeCallCount;
    },

    getMembershipCount(groupId, studentId) {
      return memberships.has(`${groupId}:${studentId}`) ? 1 : 0;
    },
  };
}

test('mock system: ACCEPT triggers finalize and REJECT does not', async () => {
  const system = createMockMembershipSystem();

  system.seedInvitation({
    id: 'inv-accept',
    groupId: 'group-1',
    studentId: 'student-1',
  });

  system.seedInvitation({
    id: 'inv-reject',
    groupId: 'group-1',
    studentId: 'student-2',
  });

  const accepted = await system.processResponse('inv-accept', 'ACCEPT');
  const rejected = await system.processResponse('inv-reject', 'REJECT');

  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(system.getFinalizeCallCount(), 1);
  assert.equal(system.getMembershipCount('group-1', 'student-1'), 1);
  assert.equal(system.getMembershipCount('group-1', 'student-2'), 0);
});

test('mock system: retrying the same ACCEPT does not double-add membership', async () => {
  const system = createMockMembershipSystem();

  system.seedInvitation({
    id: 'inv-retry',
    groupId: 'group-2',
    studentId: 'student-9',
  });

  const first = await system.processResponse('inv-retry', 'ACCEPT');
  const second = await system.processResponse('inv-retry', 'ACCEPT');

  assert.equal(first.status, 'ACCEPTED');
  assert.equal(second.status, 'ACCEPTED');
  assert.equal(system.getMembershipCount('group-2', 'student-9'), 1);
});

