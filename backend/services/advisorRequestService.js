const AdvisorRequest = require('../models/AdvisorRequest');
const Group = require('../models/Group');
const AuditLog = require('../models/AuditLog');
const sequelize = require('../db');
const NotificationService = require('./notificationService');
const { syncAdvisorAssignmentsForGroup } = require('./mentorMatchingService');
const { User } = require('../models');

const processDecision = async ({ requestId, decision, note, userId }) => {
  return sequelize.transaction(async (transaction) => {
    const advisorRequest = await AdvisorRequest.findOne({
      where: { id: requestId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!advisorRequest) {
      throw new Error('Advisor request not found');
    }
    if (advisorRequest.status !== 'PENDING') {
      throw new Error('Request already decided');
    }
    if (String(advisorRequest.advisorId) !== String(userId)) {
      throw new Error('Unauthorized: Not assigned advisor');
    }

    advisorRequest.status = decision;
    advisorRequest.note = note || null;
    advisorRequest.decidedAt = new Date();
    await advisorRequest.save({ transaction });

    let group = null;
    if (decision === 'APPROVED') {
      group = await Group.findOne({
        where: { id: advisorRequest.groupId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!group) {
        throw new Error('Group not found');
      }

      group.advisorId = String(advisorRequest.advisorId);
      group.status = 'HAS_ADVISOR';
      await group.save({ transaction });

      await syncAdvisorAssignmentsForGroup({
        groupId: advisorRequest.groupId,
        advisorId: advisorRequest.advisorId,
        transaction,
      });
    }

    await AuditLog.create({
      action: decision === 'APPROVED' ? 'ADVISOR_REQUEST_APPROVED' : 'ADVISOR_REQUEST_REJECTED',
      actorId: userId,
      targetType: 'ADVISOR_REQUEST',
      targetId: advisorRequest.id,
      metadata: {
        groupId: advisorRequest.groupId,
        advisorId: advisorRequest.advisorId,
        decision,
        note: note || null,
      },
    }, { transaction });

    if (advisorRequest.teamLeaderId) {
      const advisorUser = await User.findByPk(userId, {
        transaction,
        attributes: ['id', 'fullName', 'email'],
      });

      await NotificationService.notifyTeamLeaderAdvisorDecision({
        leaderId: advisorRequest.teamLeaderId,
        requestId: advisorRequest.id,
        groupId: advisorRequest.groupId,
        groupName: group?.name || null,
        advisorDecision: decision,
        advisorId: advisorUser?.id ?? userId,
        advisorName: advisorUser?.fullName ?? null,
        advisorEmail: advisorUser?.email ?? null,
        message: group?.name
          ? `Advisor request for ${group.name} was ${decision.toLowerCase()}.`
          : `Your advisor request was ${decision.toLowerCase()}.`,
      });
    }

    return advisorRequest;
  });
};

module.exports = { processDecision };
