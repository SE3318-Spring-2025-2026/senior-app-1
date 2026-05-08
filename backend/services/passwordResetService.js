const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const sequelize = require('../db');
const { PasswordResetToken, User } = require('../models');
const studentService = require('./studentService');

const DEFAULT_TOKEN_TTL_MINUTES = 60;
const tokenLocks = new Map();

function serviceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function createPlainToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getTokenTtlMinutes() {
  const configured = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_TOKEN_TTL_MINUTES;
}

function getFrontendBaseUrl() {
  return (
    process.env.FRONTEND_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.CLIENT_BASE_URL ||
    'http://localhost:5173'
  ).replace(/\/+$/, '');
}

function buildResetLink(token) {
  const url = new URL('/reset-password', getFrontendBaseUrl());
  url.searchParams.set('token', token);
  return url.toString();
}

function assertValidPassword(newPassword) {
  if (!studentService.validatePasswordStrength(newPassword)) {
    throw serviceError(
      400,
      'WEAK_PASSWORD',
      'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.',
    );
  }
}

async function withTokenLock(tokenHash, work) {
  const previous = tokenLocks.get(tokenHash) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  tokenLocks.set(tokenHash, queued);

  await previous;
  try {
    return await work();
  } finally {
    release();
    if (tokenLocks.get(tokenHash) === queued) {
      tokenLocks.delete(tokenHash);
    }
  }
}

async function generatePasswordResetLink({ userId, adminUser }) {
  if (!adminUser || adminUser.role !== 'ADMIN') {
    throw serviceError(403, 'FORBIDDEN', 'Admin role required.');
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw serviceError(404, 'USER_NOT_FOUND', 'User not found.');
  }

  const plainToken = createPlainToken();
  const tokenHash = hashToken(plainToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getTokenTtlMinutes() * 60 * 1000);

  await sequelize.transaction(async (transaction) => {
    await PasswordResetToken.update(
      { invalidatedAt: now },
      {
        where: {
          userId: user.id,
          usedAt: null,
          invalidatedAt: null,
        },
        transaction,
      },
    );

    await PasswordResetToken.create(
      {
        userId: user.id,
        tokenHash,
        expiresAt,
        createdByAdminId: adminUser.id,
      },
      { transaction },
    );
  });

  return {
    resetLink: buildResetLink(plainToken),
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    },
  };
}

async function resetPassword({ token, newPassword }) {
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw serviceError(400, 'RESET_TOKEN_REQUIRED', 'Reset token is required.');
  }

  assertValidPassword(newPassword);

  const tokenHash = hashToken(token.trim());
  const now = new Date();
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  return withTokenLock(tokenHash, () => sequelize.transaction(async (transaction) => {
    const [consumedCount] = await PasswordResetToken.update(
      { usedAt: now },
      {
        where: {
          tokenHash,
          usedAt: null,
          invalidatedAt: null,
          expiresAt: { [Op.gt]: now },
        },
        transaction,
      },
    );

    if (consumedCount !== 1) {
      const failedToken = await PasswordResetToken.findOne({
        where: { tokenHash },
        transaction,
      });

      if (failedToken?.usedAt) {
        throw serviceError(400, 'RESET_TOKEN_USED', 'Password reset token has already been used.');
      }

      if (failedToken?.expiresAt && failedToken.expiresAt <= now) {
        throw serviceError(400, 'RESET_TOKEN_EXPIRED', 'Password reset token has expired.');
      }

      throw serviceError(400, 'RESET_TOKEN_INVALID', 'Password reset token is invalid.');
    }

    const resetToken = await PasswordResetToken.findOne({
      where: { tokenHash },
      transaction,
    });

    const user = await User.findByPk(resetToken.userId, { transaction });
    if (!user) {
      throw serviceError(400, 'RESET_TOKEN_INVALID', 'Password reset token is invalid.');
    }

    await user.update(
      {
        password: hashedPassword,
        passwordHash: hashedPassword,
        status: 'ACTIVE',
        sessionVersion: Number(user.sessionVersion || 0) + 1,
      },
      { transaction },
    );

    await PasswordResetToken.update(
      { invalidatedAt: now },
      {
        where: {
          userId: user.id,
          id: { [Op.ne]: resetToken.id },
          usedAt: null,
          invalidatedAt: null,
        },
        transaction,
      },
    );

    return {
      userId: user.id,
      role: user.role,
    };
  }));
}

module.exports = {
  generatePasswordResetLink,
  hashToken,
  resetPassword,
};
