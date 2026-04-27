'use strict';

const { Group, DeliverableSubmission } = require('../models');

async function submitDeliverable(groupId, { sprintNumber, deliverableType, documentRef, metadata }, userId) {
  const group = await Group.findByPk(groupId);
  if (!group) {
    const err = new Error('Group not found');
    err.code = 'GROUP_NOT_FOUND';
    throw err;
  }

  const memberIds = group.memberIds || [];
  if (!memberIds.includes(String(userId))) {
    const err = new Error('User is not a member of this group');
    err.code = 'NOT_A_MEMBER';
    throw err;
  }

  const submission = await DeliverableSubmission.create({
    groupId,
    sprintNumber,
    deliverableType,
    documentRef,
    submittedBy: userId,
    metadata: metadata ?? null,
  });

  return submission;
}

async function listSubmissions(groupId) {
  return DeliverableSubmission.findAll({ where: { groupId }, order: [['createdAt', 'DESC']] });
}

module.exports = { submitDeliverable, listSubmissions };
