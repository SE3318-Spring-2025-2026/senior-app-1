const { AuditLog } = require('../models');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const MANUALLY_AUDITED_PATHS = [
  /^\/api\/v1\/advisor-requests\//,
  /^\/api\/v1\/committee\//,
  /^\/api\/v1\/coordinator\/rubrics/,
  /^\/api\/v1\/final-evaluation\/groups\/[^/]+\/(?:advisor-grade|committee-grade|team-scalar|finalize)/,
  /^\/api\/v1\/groups\/[^/]+\/deliverables/,
  /^\/api\/v1\/groups\/[^/]+\/invitations/,
  /^\/api\/v1\/groups\/[^/]+\/membership\/coordinator/,
  /^\/api\/v1\/teams\/[^/]+\/sprints\/[^/]+\/(?:ai-validations|pr-review-verifications|grade-criterion-with-ai)/,
];

function sanitizeBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;

  const sensitive = new Set([
    'password',
    'newPassword',
    'currentPassword',
    'token',
    'setupToken',
    'accessToken',
    'refreshToken',
    'authorization',
  ]);

  const result = {};
  for (const [key, value] of Object.entries(body)) {
    if (sensitive.has(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value == null) {
      result[key] = value;
    } else {
      result[key] = Array.isArray(value) ? `[array:${value.length}]` : '[object]';
    }
  }
  return result;
}

function shouldAudit(req, res) {
  if (!MUTATING_METHODS.has(req.method)) return false;
  if (!req.user?.id) return false;
  if (res.statusCode >= 400) return false;
  if (req.originalUrl.startsWith('/api/v1/admin/audit-logs')) return false;
  return !MANUALLY_AUDITED_PATHS.some((pattern) => pattern.test(req.path));
}

function auditTrail(req, res, next) {
  res.on('finish', () => {
    if (!shouldAudit(req, res)) return;

    AuditLog.create({
      actorId: req.user.id,
      action: `${req.method}_REQUEST`,
      targetType: 'API_ROUTE',
      targetId: req.path,
      metadata: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        query: req.query || {},
        body: sanitizeBody(req.body),
      },
    }).catch((error) => {
      console.error('[auditTrail] audit log failed:', error);
    });
  });

  next();
}

module.exports = auditTrail;
