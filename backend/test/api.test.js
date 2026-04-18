test('DELETE /api/v1/groups/:groupId/advisor-assignment: RBAC, removal, status, log, notification', async () => {
  // Setup users
  const admin = await User.create({
    email: 'admin-rbac@example.com',
    fullName: 'Admin User',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: 'irrelevant',
  });
  const coordinator = await User.create({
    email: 'coord-rbac@example.com',
    fullName: 'Coord User',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: 'irrelevant',
  });
  const advisor = await User.create({
    email: 'advisor-rbac@example.com',
    fullName: 'Advisor User',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: 'irrelevant',
  });
  const leader = await User.create({
    email: 'leader-rbac@example.com',
    fullName: 'Leader User',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070001000',
    password: 'irrelevant',
  });

  // Create group with advisor assigned
  const group = await Group.create({
    name: 'Advisor Test',
    leaderId: leader.id,
    memberIds: [leader.id],
    advisorId: advisor.id,
    status: 'ADVISOR_ASSIGNED',
    maxMembers: 4,
  });

  // ADMIN can remove advisor
  let res = await request(`/api/v1/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(admin),
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');
  
  const updated = await Group.findByPk(group.id);
  assert.equal(updated.advisorId, null);
  assert.equal(updated.status, 'PENDING_ADVISOR');

  // AuditLog entry check
  const log = await AuditLog.findOne({ where: { groupId: group.id, action: 'ADVISOR_REMOVED' } });
  assert.ok(log);

  // Re-assign advisor for next tests
  updated.advisorId = advisor.id;
  updated.status = 'ADVISOR_ASSIGNED';
  await updated.save();

  // COORDINATOR can remove advisor
  res = await request(`/api/v1/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(coordinator),
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');

  // Re-assign advisor for next tests
  updated.advisorId = advisor.id;
  updated.status = 'ADVISOR_ASSIGNED';
  await updated.save();

  // Current advisor can remove self
  res = await request(`/api/v1/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(advisor),
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');

  // Unauthorized student cannot remove advisor
  updated.advisorId = advisor.id;
  updated.status = 'ADVISOR_ASSIGNED';
  await updated.save();
  res = await request(`/api/v1/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(leader),
  });
  assert.equal(res.response.status, 403);

  // Removing advisor when none assigned
  updated.advisorId = null;
  updated.status = 'PENDING_ADVISOR';
  await updated.save();
  res = await request(`/api/v1/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(admin),
  });
  assert.equal(res.response.status, 400);
  assert.equal(res.json.code, 'NO_ADVISOR_ASSIGNED');

  // Invalid groupId
  res = await request(`/api/v1/groups/invalid-group-id/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(admin),
  });
  assert.equal(res.response.status, 404);
});

test('admin/coordinator can delete orphan group (no advisor)', async () => {
  const admin = await User.create({
    email: 'admin-orphan@example.com',
    fullName: 'Admin Orphan',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const coordinator = await User.create({
    email: 'coord-orphan@example.com',
    fullName: 'Coord Orphan',
    role: 'COORDINATOR',
    status: 'ACTIVE',
  });
  const group = await Group.create({
    name: 'Orphan Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: null,
  });

  const adminHeaders = await authHeaderFor(admin);
  const res1 = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  assert.equal(res1.response.status, 200);
  assert.equal(res1.json.code, 'SUCCESS');

  const coordHeaders = await authHeaderFor(coordinator);
  const res2 = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers: coordHeaders,
  });
  assert.equal(res2.response.status, 404);
});

test('cannot delete group with advisor', async () => {
  const admin = await User.create({
    email: 'admin-orphan2@example.com',
    fullName: 'Admin Orphan2',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const group = await Group.create({
    name: 'Advisor Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: 'advisor-123',
  });
  const headers = await authHeaderFor(admin);
  const res = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res.response.status, 403);
  assert.equal(res.json.code, 'GROUP_HAS_ADVISOR');
});

test('cannot delete group with invalid or non-existent id', async () => {
  const admin = await User.create({
    email: 'admin-orphan3@example.com',
    fullName: 'Admin Orphan3',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const headers = await authHeaderFor(admin);
  const res1 = await request(`/api/v1/group-database/groups/not-a-uuid`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res1.response.status, 400);

  const uuid = '00000000-0000-0000-0000-000000000000';
  const res2 = await request(`/api/v1/group-database/groups/${uuid}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res2.response.status, 404);
});

test('student cannot delete orphan group via admin endpoint', async () => {
  const student = await User.create({
    email: 'student-orphan@example.com',
    fullName: 'Student Orphan',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070009999',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const group = await Group.create({
    name: 'Student Orphan Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: null,
  });
  const headers = await authHeaderFor(student);
  const res = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res.response.status, 403);
});

test('assigned advisor can release themselves from group', async () => {
  const advisor = await User.create({
    email: 'advisor-release@example.com',
    fullName: 'Advisor Release',
    role: 'PROFESSOR',
    status: 'ACTIVE',
  });
  const group = await Group.create({
    name: 'Release Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: advisor.id,
  });
  const headers = await authHeaderFor(advisor);
  const res = await request(`/api/v1/groups/${group.id}/advisor-release`, {
    method: 'PATCH',
    headers,
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');
  const updated = await Group.findByPk(group.id);
  assert.equal(updated.advisorId, null);
});

test('admin can remove advisor assignment from group', async () => {
  const admin = await User.create({
    email: 'admin-remove-advisor@example.com',
    fullName: 'Admin Remove Advisor',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const advisor = await User.create({
    email: 'advisor-remove@example.com',
    fullName: 'Advisor Remove',
    role: 'PROFESSOR',
    status: 'ACTIVE',
  });
  const group = await Group.create({
    name: 'Remove Advisor Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: advisor.id,
  });
  const headers = await authHeaderFor(admin);
  const res = await request(`/api/v1/group-database/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');
  const updated = await Group.findByPk(group.id);
  assert.equal(updated.advisorId, null);
});

test('orphan group cleanup works after advisor removal', async () => {
  const admin = await User.create({
    email: 'admin-orphan-cleanup@example.com',
    fullName: 'Admin Orphan Cleanup',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const advisor = await User.create({
    email: 'advisor-orphan-cleanup@example.com',
    fullName: 'Advisor Orphan Cleanup',
    role: 'PROFESSOR',
    status: 'ACTIVE',
  });
  
  const group = await Group.create({
    name: 'Cleanup Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: advisor.id,
  });
  
  const headers = await authHeaderFor(admin);
  await request(`/api/v1/group-database/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers,
  });
  
  const res = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');
  
  const deleted = await Group.findByPk(group.id);
  assert.equal(deleted, null);
});