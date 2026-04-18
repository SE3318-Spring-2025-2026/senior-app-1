const AdvisorRequest = require('../models/AdvisorRequest');
const Group = require('../models/Group');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const { sequelize } = require('../db');

const processDecision = async ({ requestId, decision, note, userId }) => {
  return await sequelize.transaction(async (t) => {
    // 1. Fetch AdvisorRequest
    const advisorRequest = await AdvisorRequest.findOne({ where: { id: requestId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!advisorRequest) throw new Error('Advisor request not found');
    if (advisorRequest.status !== 'PENDING') throw new Error('Request already decided');
    if (advisorRequest.advisorId !== userId) throw new Error('Unauthorized: Not assigned advisor');

    // 2. Update AdvisorRequest status
    advisorRequest.status = decision;
    advisorRequest.decisionNote = note;
    await advisorRequest.save({ transaction: t });

    // 3. If approved, update Group.advisorId
    if (decision === 'APPROVED') {
      const group = await Group.findOne({ where: { id: advisorRequest.groupId }, transaction: t, lock: t.LOCK.UPDATE });
      if (!group) throw new Error('Group not found');
      group.advisorId = advisorRequest.advisorId;
      await group.save({ transaction: t });
    }

    // 4. Create Notification for Team Leader
    await Notification.create({
      userId: advisorRequest.teamLeaderId,
      type: 'ADVISOR_DECISION',
      message: `Advisor ${decision.toLowerCase()} your request.`,
      meta: { groupId: advisorRequest.groupId, advisorId: advisorRequest.advisorId },
    }, { transaction: t });

    // 5. Audit Log
    await AuditLog.create({
      action: 'ADVISOR_DECISION',
      performedBy: userId,
      details: { requestId, decision, note },
    }, { transaction: t });

    return advisorRequest;
  });
};

module.exports = { processDecision };
