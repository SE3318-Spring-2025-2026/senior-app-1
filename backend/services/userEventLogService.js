'use strict';

const AuditLog = require('../models/AuditLog');

const SENSITIVE_FIELDS = new Set([
  'password',
  'newPassword',
  'token',
  'setupToken',
  'authorization',
  'secret',
]);

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const clean = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!SENSITIVE_FIELDS.has(key.toLowerCase())) {
      clean[key] = value;
    }
  }
  return clean;
}

function extractRequestContext(req) {
  if (!req) return {};
  return {
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers?.['user-agent'],
    method: req.method,
    path: req.path,
  };
}

/**
 * Log a user/auth audit event. Never throws — failures are swallowed so the
 * main request flow is never disrupted.
 */
async function logUserEvent(req, { action, actorId = null, targetType = null, targetId = null, metadata = {} } = {}) {
  try {
    const requestContext = extractRequestContext(req);
    const safeMetadata = sanitizeMetadata({ ...requestContext, ...metadata });

    await AuditLog.create({
      action,
      actorId: actorId || null,
      targetType: targetType || null,
      targetId: targetId ? String(targetId) : null,
      metadata: safeMetadata,
    });
  } catch (err) {
    console.error('[userEventLogService] Failed to write audit log:', err);
  }
}

module.exports = { logUserEvent };
