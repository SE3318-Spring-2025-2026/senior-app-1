const { Group, FinalEvaluationGrade, Deliverable } = require('../models');

function serviceError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function submitAdvisorGrade({ groupId, deliverableId, advisorId, scores, comments }) {
  const group = await Group.findByPk(groupId);
  if (!group) throw serviceError('GROUP_NOT_FOUND', 'Group not found');
  if (String(group.advisorId) !== String(advisorId)) throw serviceError('FORBIDDEN', 'Only the assigned advisor can submit/update the grade for this group');
  const deliverable = await Deliverable.findByPk(deliverableId);
  if (!deliverable || deliverable.groupId !== groupId) throw serviceError('DELIVERABLE_NOT_FOUND', 'Deliverable not found or does not belong to this group');
  if (!Array.isArray(scores) || scores.length === 0) throw serviceError('INVALID_SCORES', 'At least one score is required');
  for (const score of scores) {
    if (!score.criterionId) throw serviceError('INVALID_SCORE_FORMAT', 'Each score must have a criterionId');
    if (typeof score.value !== 'number' || score.value < 0 || score.value > 100) throw serviceError('INVALID_SCORE_VALUE', 'Score value must be between 0 and 100');
  }
  const existing = await FinalEvaluationGrade.findOne({ where: { groupId, deliverableId, submittedBy: advisorId } });
  if (existing) throw serviceError('ADVISOR_GRADE_EXISTS', 'This advisor has already submitted a grade for this deliverable');
  const finalScore = scores.reduce((sum, s) => sum + (s.value || 0), 0) / scores.length;
  const grade = await FinalEvaluationGrade.create({ groupId, deliverableId, submittedBy: advisorId, scores, comments: comments || null, finalScore });
  return grade;
}

async function updateAdvisorGrade({ groupId, deliverableId, advisorId, scores, comments }) {
  const group = await Group.findByPk(groupId);
  if (!group) throw serviceError('GROUP_NOT_FOUND', 'Group not found');
  if (String(group.advisorId) !== String(advisorId)) throw serviceError('FORBIDDEN', 'Only the assigned advisor can update the grade for this group');
  const deliverable = await Deliverable.findByPk(deliverableId);
  if (!deliverable || deliverable.groupId !== groupId) throw serviceError('DELIVERABLE_NOT_FOUND', 'Deliverable not found or does not belong to this group');
  if (!Array.isArray(scores) || scores.length === 0) throw serviceError('INVALID_SCORES', 'At least one score is required');
  for (const score of scores) {
    if (!score.criterionId) throw serviceError('INVALID_SCORE_FORMAT', 'Each score must have a criterionId');
    if (typeof score.value !== 'number' || score.value < 0 || score.value > 100) throw serviceError('INVALID_SCORE_VALUE', 'Score value must be between 0 and 100');
  }
  const existing = await FinalEvaluationGrade.findOne({ where: { groupId, deliverableId, submittedBy: advisorId } });
  if (!existing) throw serviceError('GRADE_NOT_FOUND', 'Grade not found');
  existing.scores = scores;
  existing.comments = comments || null;
  existing.finalScore = scores.reduce((sum, s) => sum + (s.value || 0), 0) / scores.length;
  await existing.save();
  return existing;
}

