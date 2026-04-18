const { Group, AdvisorRequest, User } = require('../models');

class StudentRegistrationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function createAdvisorRequest({ groupId, professorId, teamLeaderId }) {
  // Verify group exists and user is the leader
  const group = await Group.findByPk(groupId);
  if (!group) {
    throw new StudentRegistrationError('GROUP_NOT_FOUND', 'Group not found', 404);
  }

  if (String(group.leaderId) !== String(teamLeaderId)) {
    throw new StudentRegistrationError('UNAUTHORIZED_GROUP', 'Only group leader can submit requests', 403);
  }

  // Verify professor exists
  const professor = await User.findByPk(professorId);
  if (!professor || professor.role !== 'PROFESSOR') {
    throw new StudentRegistrationError('PROFESSOR_NOT_FOUND', 'Professor not found', 404);
  }

  // Check for existing active request
  const existingRequest = await AdvisorRequest.findOne({
    where: {
      groupId,
      professorId,
      status: ['PENDING', 'APPROVED'],
    },
  });

  if (existingRequest) {
    throw new StudentRegistrationError('DUPLICATE_REQUEST', 'Request already exists for this professor', 409);
  }

  // Create request
  const request = await AdvisorRequest.create({
    groupId,
    professorId,
    teamLeaderId,
    status: 'PENDING',
  });

  return request;
}

async function getGroupAdvisorRequests({ groupId }) {
  const group = await Group.findByPk(groupId);
  if (!group) {
    throw new StudentRegistrationError('GROUP_NOT_FOUND', 'Group not found', 404);
  }

  const requests = await AdvisorRequest.findAll({
    where: { groupId },
    order: [['createdAt', 'DESC']],
  });

  return requests;
}

async function getProfessorIncomingRequests({ professorId }) {
  const professor = await User.findByPk(professorId);
  if (!professor || professor.role !== 'PROFESSOR') {
    throw new StudentRegistrationError('PROFESSOR_NOT_FOUND', 'Professor not found', 404);
  }

  const requests = await AdvisorRequest.findAll({
    where: {
      professorId,
      status: 'PENDING',
    },
    order: [['createdAt', 'DESC']],
  });

  return requests;
}

async function updateAdvisorRequestStatus({ requestId, status, decisionNote, professorId }) {
  const request = await AdvisorRequest.findByPk(requestId);
  if (!request) {
    throw new StudentRegistrationError('REQUEST_NOT_FOUND', 'Request not found', 404);
  }

  if (String(request.professorId) !== String(professorId)) {
    throw new StudentRegistrationError('UNAUTHORIZED_REQUEST', 'Only assigned professor can decide', 403);
  }

  if (request.status !== 'PENDING') {
    throw new StudentRegistrationError('REQUEST_NOT_PENDING', 'Request already decided', 409);
  }

  request.status = status;
  if (decisionNote) {
    request.decisionNote = decisionNote;
  }
  await request.save();

  // If approved, update group advisor
  if (status === 'APPROVED') {
    const group = await Group.findByPk(request.groupId);
    if (group) {
      group.advisorId = professorId;
      await group.save();
    }
  }

  return request;
}

async function cancelAdvisorRequest({ requestId, teamLeaderId }) {
  const request = await AdvisorRequest.findByPk(requestId);
  if (!request) {
    throw new StudentRegistrationError('REQUEST_NOT_FOUND', 'Request not found', 404);
  }

  if (String(request.teamLeaderId) !== String(teamLeaderId)) {
    throw new StudentRegistrationError('UNAUTHORIZED_REQUEST', 'Only team leader can cancel', 403);
  }

  if (request.status !== 'PENDING') {
    throw new StudentRegistrationError('REQUEST_NOT_PENDING', 'Only pending requests can be cancelled', 409);
  }

  request.status = 'CANCELLED';
  await request.save();

  return request;
}

module.exports = {
  StudentRegistrationError,
  createAdvisorRequest,
  getGroupAdvisorRequests,
  getProfessorIncomingRequests,
  updateAdvisorRequestStatus,
  cancelAdvisorRequest,
};
