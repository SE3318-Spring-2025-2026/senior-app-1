'use strict';

/**
 * Orchestrates the two AI sprint-monitoring features:
 *   1. Verifying PR reviews on stored SprintPullRequest rows.
 *   2. Validating issue implementations from JIRA description + PR file diffs.
 *
 * This is the layer that talks to the database (SprintPullRequest /
 * AIValidationResult / AuditLog), to the GitHub API client when extra context
 * is needed, and to aiService for the actual model calls.
 */

const { Op } = require('sequelize');
const aiService = require('./aiService');
const githubApiClient = require('./githubApiClientService');
const githubPrDataService = require('./githubPrDataService');
const {
  SprintPullRequest,
  AIValidationResult,
  AuditLog,
  Group,
  IntegrationBinding,
  IntegrationTokenReference,
} = require('../models');

function fireAndForgetAudit(payload) {
  AuditLog.create(payload).catch((err) => {
    console.error('[aiFeatureService] audit log failed:', err);
  });
}

async function getTeamGitHubContext(teamId) {
  const binding = await IntegrationBinding.findOne({ where: { teamId } });
  if (!binding) return null;

  const config = await binding.getDataValue ? null : null; // placeholder
  const tokenRef = await IntegrationTokenReference.findByPk(teamId);
  const token = tokenRef?.githubTokenRef || null;

  let organizationName = null;
  let repositoryName = null;
  try {
    const provs = binding.providerSet || binding.getDataValue?.('providerSet');
    if (binding.githubOrganizationName) organizationName = binding.githubOrganizationName;
    if (binding.githubRepositoryName) repositoryName = binding.githubRepositoryName;
  } catch (_) {}

  return { token, organizationName, repositoryName, binding };
}

/**
 * Run AI PR review verification for a single stored SprintPullRequest.
 * Updates the row with reviewVerified / reviewConfidence / reviewReasoning.
 */
async function verifyPrReviewForRow({ row, reviews, prTitle, prDescription, actorId }) {
  const result = await aiService.classifyPrReview({
    prTitle: prTitle || row.title || '',
    prDescription: prDescription || '',
    reviews: reviews || [],
  });

  await row.update({
    reviewVerified: result.status,
    reviewConfidence: result.confidence,
    reviewReasoning: result.reasoning || null,
    reviewVerifiedAt: new Date(),
  });

  fireAndForgetAudit({
    action: 'PR_REVIEW_VERIFIED',
    actorId: actorId || null,
    targetType: 'SPRINT_PULL_REQUEST',
    targetId: row.id,
    metadata: {
      teamId: row.teamId,
      sprintId: row.sprintId,
      prNumber: row.prNumber,
      reviewVerified: result.status,
      reviewConfidence: result.confidence,
    },
  });

  return {
    prNumber: row.prNumber,
    reviewVerified: result.status,
    reviewConfidence: result.confidence,
    reviewReasoning: result.reasoning,
  };
}

/**
 * Verify all PRs for a (teamId, sprintId) pair. Pulls reviews from GitHub
 * when a token is available; otherwise calls the AI service with whatever
 * data is on the stored row (so the AI still classifies based on PR metadata
 * — usually NOT_REVIEWED or low confidence).
 */
async function verifyPrReviewsForSprint({ teamId, sprintId, actorId }) {
  const rows = await SprintPullRequest.findAll({
    where: { teamId, sprintId, isActive: true },
  });

  if (!rows.length) {
    return { teamId, sprintId, processed: 0, results: [] };
  }

  const ctx = await getTeamGitHubContext(teamId);

  const results = [];
  for (const row of rows) {
    let reviews = [];
    if (ctx?.token && ctx.organizationName && ctx.repositoryName) {
      try {
        reviews = await githubApiClient.getPullRequestReviews(
          ctx.token,
          ctx.organizationName,
          ctx.repositoryName,
          row.prNumber,
        );
      } catch (err) {
        console.warn(`[aiFeatureService] could not fetch reviews for PR ${row.prNumber}:`, err.message);
      }
    }

    const verified = await verifyPrReviewForRow({
      row,
      reviews,
      prTitle: row.title,
      prDescription: typeof row.diffSummary === 'string' ? row.diffSummary : '',
      actorId,
    });
    results.push(verified);
  }

  return { teamId, sprintId, processed: rows.length, results };
}

async function listPrReviewStatuses({ teamId, sprintId }) {
  const rows = await SprintPullRequest.findAll({
    where: { teamId, sprintId, isActive: true },
    order: [['prNumber', 'ASC']],
  });
  return rows.map((row) => ({
    prNumber: row.prNumber,
    issueKey: row.relatedIssueKey,
    branchName: row.branchName,
    title: row.title,
    reviewVerified: row.reviewVerified,
    reviewConfidence: row.reviewConfidence,
    reviewReasoning: row.reviewReasoning,
    reviewVerifiedAt: row.reviewVerifiedAt,
  }));
}

/**
 * Validate one issue's implementation: send JIRA description + PR file diffs
 * to the AI and persist the verdict as an AIValidationResult row.
 *
 * Upserts on (teamId, sprintId, issueKey).
 */
async function runImplementationValidation({
  teamId,
  sprintId,
  issueKey,
  issueDescription,
  fileDiffs,
  prNumber,
  actorId,
}) {
  const aiResult = await aiService.classifyImplementation({
    issueDescription,
    fileDiffs,
  });

  const existing = await AIValidationResult.findOne({
    where: { teamId, sprintId, issueKey },
  });

  let row;
  if (existing) {
    row = await existing.update({
      validationStatus: aiResult.status,
      confidence: aiResult.confidence,
      feedback: aiResult.feedback,
      prNumber: prNumber ?? existing.prNumber,
      requestedBy: actorId ?? existing.requestedBy,
      validatedAt: new Date(),
    });
  } else {
    row = await AIValidationResult.create({
      teamId,
      sprintId,
      issueKey,
      validationStatus: aiResult.status,
      confidence: aiResult.confidence,
      feedback: aiResult.feedback,
      prNumber: prNumber ?? null,
      requestedBy: actorId ?? null,
      validatedAt: new Date(),
    });
  }

  fireAndForgetAudit({
    action: 'AI_VALIDATION_STORED',
    actorId: actorId || null,
    targetType: 'AI_VALIDATION_RESULT',
    targetId: row.id,
    metadata: {
      teamId,
      sprintId,
      issueKey,
      validationStatus: row.validationStatus,
      confidence: row.confidence,
    },
  });

  return row;
}

async function listValidationsForSprint({ teamId, sprintId }) {
  const rows = await AIValidationResult.findAll({
    where: { teamId, sprintId },
    order: [['issueKey', 'ASC']],
  });
  return rows;
}

/**
 * Persist a batch of AI validation results sent from the (potentially
 * external) AI worker. This is Business Flow 15.
 */
async function storeValidationsBatch({ teamId, sprintId, validations }) {
  if (!Array.isArray(validations) || !validations.length) {
    return { stored: 0 };
  }

  const stored = [];
  for (const v of validations) {
    if (!v?.issueKey || !v?.validationStatus) continue;
    const existing = await AIValidationResult.findOne({
      where: { teamId, sprintId, issueKey: v.issueKey },
    });
    const payload = {
      teamId,
      sprintId,
      issueKey: v.issueKey,
      validationStatus: v.validationStatus,
      confidence: typeof v.confidence === 'number' ? v.confidence : 0,
      feedback: v.feedback ?? null,
      prNumber: v.prNumber ?? null,
      validatedAt: v.validatedAt ? new Date(v.validatedAt) : new Date(),
    };
    let row;
    if (existing) {
      row = await existing.update(payload);
    } else {
      row = await AIValidationResult.create(payload);
    }
    stored.push(row);
    fireAndForgetAudit({
      action: 'AI_VALIDATION_STORED',
      actorId: null,
      targetType: 'AI_VALIDATION_RESULT',
      targetId: row.id,
      metadata: {
        teamId,
        sprintId,
        issueKey: v.issueKey,
        validationStatus: row.validationStatus,
        confidence: row.confidence,
      },
    });
  }

  return { stored: stored.length };
}

/**
 * Aggregate AI signals into a single team-evaluation summary used by the
 * grading pipeline. Returns:
 *   - reviewedRatio: fraction of PRs the AI marked REVIEWED
 *   - matchedRatio: fraction of validated issues marked MATCHED (PARTIAL=0.5)
 *   - aiAvailable: boolean
 */
/**
 * Grade a single rubric criterion by sending the team's recent GitHub PR
 * data (titles, branches, change summaries, AI review-verification verdicts,
 * AI implementation-validation verdicts) to the LLM along with the criterion
 * question. The LLM returns a percentage score 0-100 and feedback. The
 * caller (committee grading page) shows that as a suggestion the professor
 * can accept or override.
 */
async function gradeCriterionFromTeamGithub({ teamId, sprintId, criterion }) {
  if (!criterion || !criterion.question) {
    return { percent: 0, feedback: 'Criterion is missing a question.' };
  }

  const prs = await SprintPullRequest.findAll({
    where: { teamId, sprintId, isActive: true },
    order: [['prNumber', 'ASC']],
  });
  const validations = await AIValidationResult.findAll({
    where: { teamId, sprintId },
    order: [['issueKey', 'ASC']],
  });

  const summary = {
    pullRequests: prs.map((pr) => ({
      prNumber: pr.prNumber,
      issueKey: pr.relatedIssueKey,
      title: pr.title,
      branch: pr.branchName,
      mergeStatus: pr.mergeStatus,
      changedFileCount: Array.isArray(pr.changedFiles) ? pr.changedFiles.length : 0,
      diffSummary: typeof pr.diffSummary === 'string' ? pr.diffSummary.slice(0, 300) : null,
      reviewVerified: pr.reviewVerified,
      reviewConfidence: pr.reviewConfidence,
    })),
    aiValidations: validations.map((v) => ({
      issueKey: v.issueKey,
      validationStatus: v.validationStatus,
      confidence: v.confidence,
      feedback: typeof v.feedback === 'string' ? v.feedback.slice(0, 200) : null,
    })),
  };

  // Reuse the implementation-validation classifier with a synthetic "issue
  // description" derived from the criterion question. The LLM is asked to
  // return MATCHED/PARTIAL_MATCH/NOT_MATCHED — we map that to a percentage.
  const classification = await aiService.classifyImplementation({
    issueDescription: [
      `Grade this rubric criterion against the team's GitHub work for sprint ${sprintId}:`,
      `Criterion: ${criterion.question}`,
      `Maximum: ${criterion.maxPoints || 100} points`,
      'Decide whether the team did well (MATCHED), partially (PARTIAL_MATCH),',
      'or poorly (NOT_MATCHED). Use the supplied PR list and AI verdicts.',
    ].join(' '),
    fileDiffs: [
      { path: 'team-github-summary.json', diff: JSON.stringify(summary, null, 2).slice(0, 6000) },
    ],
  });

  const percentByStatus = {
    MATCHED: 90,
    PARTIAL_MATCH: 60,
    NOT_MATCHED: 25,
    AI_UNAVAILABLE: 0,
    AI_ERROR: 0,
    AI_PARSE_ERROR: 0,
  };
  const percent = percentByStatus[classification.status] ?? 0;

  return {
    percent,
    status: classification.status,
    confidence: classification.confidence,
    feedback: classification.feedback || `Mapped from ${classification.status}.`,
    sample: { pullRequestCount: prs.length, validationCount: validations.length },
    // Full transparency for the UI: the criterion we asked about, the data
    // we collected from Supabase/SQLite, the prompt + raw model response,
    // and the percentage-mapping table so the professor can see exactly
    // why the suggested percent landed where it did.
    explain: {
      criterion: {
        question: criterion.question,
        maxPoints: criterion.maxPoints || null,
      },
      inputs: summary,
      prompt: classification.trace?.systemPrompt || null,
      userPayload: classification.trace?.userPayload || null,
      rawResponse: classification.trace?.rawResponse || null,
      provider: classification.trace?.provider || null,
      model: classification.trace?.model || null,
      elapsedMs: classification.trace?.elapsedMs || null,
      mapping: percentByStatus,
    },
  };
}

async function aggregateAiSignalsForSprint({ teamId, sprintId }) {
  const prs = await SprintPullRequest.findAll({
    where: { teamId, sprintId, isActive: true },
  });
  const validations = await AIValidationResult.findAll({
    where: { teamId, sprintId },
  });

  const totalPrs = prs.length;
  const reviewedPrs = prs.filter((p) => p.reviewVerified === 'REVIEWED').length;

  const totalValidations = validations.length;
  const matchScore = validations.reduce((acc, v) => {
    if (v.validationStatus === 'MATCHED') return acc + 1;
    if (v.validationStatus === 'PARTIAL_MATCH') return acc + 0.5;
    return acc;
  }, 0);

  return {
    teamId,
    sprintId,
    aiAvailable: aiService.isAvailable(),
    pullRequestCount: totalPrs,
    reviewedPullRequestCount: reviewedPrs,
    reviewedRatio: totalPrs ? reviewedPrs / totalPrs : 0,
    aiValidationCount: totalValidations,
    matchedRatio: totalValidations ? matchScore / totalValidations : 0,
  };
}

module.exports = {
  verifyPrReviewsForSprint,
  verifyPrReviewForRow,
  listPrReviewStatuses,
  runImplementationValidation,
  listValidationsForSprint,
  storeValidationsBatch,
  aggregateAiSignalsForSprint,
  gradeCriterionFromTeamGithub,
};
