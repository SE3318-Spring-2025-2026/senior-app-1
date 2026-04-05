const sequelize = require('../db');
const { Group, AuditLog } = require('../models');

const GROUP_NAME_MIN_LENGTH = 3;
const GROUP_NAME_MAX_LENGTH = 80;

function createServiceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeGroupName(name) {
  return name.trim().toLowerCase();
}

function validateGroupName(name) {
  if (typeof name !== 'string') {
    throw createServiceError(400, 'INVALID_GROUP_NAME', 'Group name is required.');
  }

  const trimmed = name.trim();
  if (trimmed.length < GROUP_NAME_MIN_LENGTH || trimmed.length > GROUP_NAME_MAX_LENGTH) {
    throw createServiceError(
      400,
      'INVALID_GROUP_NAME',
      `Group name must be between ${GROUP_NAME_MIN_LENGTH} and ${GROUP_NAME_MAX_LENGTH} characters.`,
    );
  }

  return trimmed;
}

async function createShell(name, leaderId) {
  if (!leaderId) {
    throw createServiceError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  const sanitizedName = validateGroupName(name);
  const normalizedName = normalizeGroupName(sanitizedName);

  return sequelize.transaction(async (transaction) => {
    const existing = await Group.findOne({
      where: { normalizedName },
      transaction,
    });

    if (existing) {
      throw createServiceError(400, 'DUPLICATE_GROUP_NAME', 'Group name already exists.');
    }

    const group = await Group.create(
      {
        name: sanitizedName,
        normalizedName,
        leaderId,
        memberIds: [leaderId],
      },
      { transaction },
    );

    await AuditLog.create(
      {
        action: 'GROUP_CREATED',
        actorId: String(leaderId),
        targetId: group.id,
        metadata: { groupName: sanitizedName },
      },
      { transaction },
    );

    return group;
  });
}

module.exports = {
  createShell,
};

