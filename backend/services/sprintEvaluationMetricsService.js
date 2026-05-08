const ApiError = require('../errors/apiError');

const DONE_STATUSES = new Set(['DONE', 'COMPLETED', 'RESOLVED', 'CLOSED']);
const MERGED_STATUS = 'MERGED';
const OPEN_STATUS = 'OPEN';

function normalizeUpper(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toUpperCase();
}

function clamp0to100(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function safePercent(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return (n / d) * 100;
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw ApiError.badRequest('VALIDATION_ERROR', 'Validation failed', [{
      field: fieldName,
      message: `${fieldName} is required`,
      location: 'body',
      value,
    }]);
  }
  return value.trim();
}

function requireNonEmptyArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw ApiError.badRequest('VALIDATION_ERROR', 'Validation failed', [{
      field: fieldName,
      message: `${fieldName} must be a non-empty array`,
      location: 'body',
      value,
    }]);
  }
  return value;
}

function getStoryArray(input) {
  if (Array.isArray(input?.storyData)) return input.storyData;
  if (Array.isArray(input?.stories)) return input.stories;
  return input?.storyData ?? input?.stories;
}

function getPrArray(input) {
  if (Array.isArray(input?.prData)) return input.prData;
  if (Array.isArray(input?.pullRequests)) return input.pullRequests;
  return input?.prData ?? input?.pullRequests;
}

/**
 * Computes sprint evaluation metrics from already-aggregated story/PR inputs.
 *
 * Output includes:
 * - sprintEvaluationCreateRequest: DTO-compatible object (SprintEvaluationCreateRequest)
 * - evaluationMetricStoreRequest: DTO-compatible object (EvaluationMetricStoreRequest)
 * - computed: additional computed counts/ratios (for debugging/persistence enrichment)
 */
function computeSprintEvaluationMetrics(input) {
  const teamId = requireNonEmptyString(input?.teamId, 'teamId');
  const sprintId = requireNonEmptyString(input?.sprintId, 'sprintId');

  const rawStories = getStoryArray(input);
  const stories = requireNonEmptyArray(rawStories, 'storyData');

  const rawPrs = getPrArray(input);
  const pullRequests = Array.isArray(rawPrs) ? rawPrs : [];

  const storyIssueKeys = new Set(
    stories
      .map((story) => (story?.issueKey ?? story?.key ?? '').toString().trim())
      .filter(Boolean),
  );

  const completedStoryCount = stories.reduce((count, story) => {
    const status = normalizeUpper(story?.status);
    return DONE_STATUSES.has(status) ? count + 1 : count;
  }, 0);
  const totalStoryCount = stories.length;
  const incompleteStoryCount = Math.max(0, totalStoryCount - completedStoryCount);
  const completionRate = clamp0to100(safePercent(completedStoryCount, totalStoryCount));

  const mergedPrCount = pullRequests.reduce((count, pr) => {
    const status = normalizeUpper(pr?.mergeStatus || pr?.prStatus || pr?.status);
    return status === MERGED_STATUS ? count + 1 : count;
  }, 0);
  const openPrCount = pullRequests.reduce((count, pr) => {
    const status = normalizeUpper(pr?.mergeStatus || pr?.prStatus || pr?.status);
    return status === OPEN_STATUS ? count + 1 : count;
  }, 0);
  const prTotalCountForRatio = mergedPrCount + openPrCount;
  const prCompletionRatio = clamp0to100(safePercent(mergedPrCount, prTotalCountForRatio));

  const linkedIssueKeys = new Set(
    pullRequests
      .map((pr) => (pr?.issueKey ?? '').toString().trim())
      .filter(Boolean)
      .filter((issueKey) => storyIssueKeys.has(issueKey)),
  );
  const issueToPrMappingCoverage = clamp0to100(safePercent(linkedIssueKeys.size, totalStoryCount));

  const hasAnyPrForScoring = prTotalCountForRatio > 0;
  const aggregatedScore = clamp0to100(
    hasAnyPrForScoring
      ? (0.7 * completionRate) + (0.3 * prCompletionRatio)
      : completionRate,
  );

  const createdBy = typeof input?.createdBy === 'string' ? input.createdBy : undefined;
  const gradingSummary = typeof input?.gradingSummary === 'string' ? input.gradingSummary : undefined;

  const sprintEvaluationCreateRequest = {
    aggregatedScore,
    completionRate,
    createdBy,
    gradingSummary,
  };

  // Remove undefined optional fields to keep DTO strict/clean.
  Object.keys(sprintEvaluationCreateRequest).forEach((key) => {
    if (sprintEvaluationCreateRequest[key] === undefined) {
      delete sprintEvaluationCreateRequest[key];
    }
  });

  const evaluationMetricStoreRequest = {
    teamId,
    sprintId,
    metrics: [
      { metricName: 'completedStoryCount', metricValue: completedStoryCount, unit: 'count' },
      { metricName: 'incompleteStoryCount', metricValue: incompleteStoryCount, unit: 'count' },
      { metricName: 'completionRate', metricValue: completionRate, unit: 'percent' },
      { metricName: 'mergedPrCount', metricValue: mergedPrCount, unit: 'count' },
      { metricName: 'openPrCount', metricValue: openPrCount, unit: 'count' },
      { metricName: 'prCompletionRatio', metricValue: prCompletionRatio, unit: 'percent' },
      { metricName: 'issueToPrMappingCoverage', metricValue: issueToPrMappingCoverage, unit: 'percent' },
      { metricName: 'aggregatedScore', metricValue: aggregatedScore, unit: 'score' },
    ],
  };

  return {
    teamId,
    sprintId,
    sprintEvaluationCreateRequest,
    evaluationMetricStoreRequest,
    computed: {
      totalStoryCount,
      completedStoryCount,
      incompleteStoryCount,
      mergedPrCount,
      openPrCount,
      prTotalCountForRatio,
      linkedIssueCount: linkedIssueKeys.size,
      completionRate,
      prCompletionRatio,
      issueToPrMappingCoverage,
      aggregatedScore,
    },
  };
}

module.exports = {
  computeSprintEvaluationMetrics,
  // Export helpers for unit tests only (non-breaking).
  _internals: {
    safePercent,
    clamp0to100,
    normalizeUpper,
  },
};

