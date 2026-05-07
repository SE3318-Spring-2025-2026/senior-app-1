// Safely convert value to trimmed string, or null if empty/non-string.
function toTrimmedString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Safely convert value to positive integer, or null if invalid/non-positive.
function toPositiveInteger(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Return first defined (non-null, non-undefined) value from arguments.
function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

// Extract PR data from payload, supporting multiple nesting patterns.
// Handles GitHub webhook (pull_request), internal formats (pullRequest, pr), etc.
function extractPullRequestSection(payload) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  return payload.pull_request
    || payload.pullRequest
    || payload.pullRequestData
    || payload.pull_request_data
    || payload.pr
    || payload;
}

// Extract JIRA issue key from text using pattern: [A-Z][A-Z0-9]+-[0-9]+ (e.g., ABC-123).
function extractIssueKeyFromText(text) {
  const normalizedText = toTrimmedString(text);
  if (!normalizedText) {
    return null;
  }
  const match = normalizedText.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  return match ? match[1] : null;
}

// Extract JIRA issue key from payload/PR or infer from PR title/body/branch.
function extractIssueKey(payload, pullRequest) {
  // Check for direct issue key field in payload or PR object.
  const directCandidates = [
    payload.issueKey,
    payload.issue_key,
    payload.jiraIssueKey,
    payload.jira_issue_key,
    pullRequest.issueKey,
    pullRequest.issue_key,
    pullRequest.jiraIssueKey,
    pullRequest.jira_issue_key,
  ];
  for (const candidate of directCandidates) {
    const issueKey = toTrimmedString(candidate);
    if (issueKey) {
      return issueKey;
    }
  }
  // Fall back to extracting from PR title/body/branches if direct field not found.
  const searchableText = [
    pullRequest.title,
    pullRequest.body,
    pullRequest.head?.ref,
    pullRequest.base?.ref,
    payload.branchName,
    payload.branch_name,
    payload.ref,
  ]
    .map((value) => toTrimmedString(value))
    .filter(Boolean)
    .join(' ');
  return extractIssueKeyFromText(searchableText);
}

// Extract branch name from payload or PR object, supporting multiple field names.
function normalizeBranchName(payload, pullRequest) {
  return firstDefined(
    toTrimmedString(payload.branchName),
    toTrimmedString(payload.branch_name),
    toTrimmedString(pullRequest.branchName),
    toTrimmedString(pullRequest.branch_name),
    toTrimmedString(pullRequest.head?.ref),
    toTrimmedString(payload.ref),
  ) || null;
}

// Normalize PR state to standard enum: MERGED, CLOSED, DRAFT, OPEN, UNKNOWN.
function normalizePullRequestStatus(pullRequest) {
  if (pullRequest.merged === true || pullRequest.merged_at) {
    return 'MERGED';
  }
  if (String(pullRequest.state || '').toLowerCase() === 'closed') {
    return 'CLOSED';
  }
  if (pullRequest.draft === true) {
    return 'DRAFT';
  }
  if (String(pullRequest.state || '').toLowerCase() === 'open') {
    return 'OPEN';
  }
  return 'UNKNOWN';
}

// Normalize PR merge status: MERGED, MERGEABLE, CONFLICTING, BLOCKED, UNSTABLE, NOT_MERGED, UNKNOWN.
function normalizeMergeStatus(pullRequest) {
  if (pullRequest.merged === true || pullRequest.merged_at) {
    return 'MERGED';
  }
  const mergeableState = String(firstDefined(
    pullRequest.mergeable_state,
    pullRequest.mergeableState,
    pullRequest.mergeStatus,
    pullRequest.merge_status,
  ) || '').toLowerCase();
  const mapping = {
    clean: 'MERGEABLE',
    dirty: 'CONFLICTING',
    blocked: 'BLOCKED',
    unstable: 'UNSTABLE',
    has_hooks: 'BLOCKED',
    unknown: 'UNKNOWN',
  };
  if (mapping[mergeableState]) {
    return mapping[mergeableState];
  }
  if (String(pullRequest.state || '').toLowerCase() === 'closed') {
    return 'NOT_MERGED';
  }
  return 'UNKNOWN';
}

// Extract and normalize changed files list from payload/PR, supporting multiple field names.
// Returns array of normalized file objects with filename, status, additions, deletions, changes.
function normalizeChangedFiles(payload, pullRequest) {
  const candidates = [
    payload?.changedFiles,
    payload?.changed_files,
    payload?.files,
    pullRequest?.changedFiles,
    pullRequest?.changed_files,
    pullRequest?.files,
  ];
  // Find first candidate that is actually an array.
  let source = null;
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      source = candidate;
      break;
    }
  }
  if (!source) {
    return [];
  }
  return source
    .filter((file) => file && typeof file === 'object')
    .map((file) => ({
      filename: toTrimmedString(file.filename || file.name || file.path),
      status: toTrimmedString(file.status) || 'modified',
      additions: toPositiveInteger(file.additions) || 0,
      deletions: toPositiveInteger(file.deletions) || 0,
      changes: toPositiveInteger(file.changes) || 0,
      previousFilename: toTrimmedString(file.previous_filename || file.previousFilename),
    }))
    .filter((file) => file.filename);
}

// Calculate and summarize diff statistics: additions, deletions, file count, total changes.
function normalizeDiffSummary(payload, pullRequest, changedFiles) {
  const additions = toPositiveInteger(firstDefined(
    pullRequest.additions,
    payload.additions,
  )) || 0;
  const deletions = toPositiveInteger(firstDefined(
    pullRequest.deletions,
    payload.deletions,
  )) || 0;
  const changedFilesCount = toPositiveInteger(firstDefined(
    pullRequest.changed_files,
    pullRequest.changedFilesCount,
    payload.changed_files,
    payload.changedFilesCount,
    changedFiles.length,
  )) || changedFiles.length;
  return {
    additions,
    deletions,
    changedFilesCount,
    totalChanges: additions + deletions,
    summary: `${additions} additions, ${deletions} deletions across ${changedFilesCount} files`,
  };
}

// Main normalizer: convert GitHub PR payload to standardized format.
// Returns: {prNumber, branchName, issueKey, prStatus, mergeStatus, diffSummary, changedFiles}
function normalizePullRequestData(payload) {
  const sourcePayload = payload && typeof payload === 'object' ? payload : {};
  const pullRequest = extractPullRequestSection(sourcePayload);
  const changedFiles = normalizeChangedFiles(sourcePayload, pullRequest);
  return {
    prNumber: toPositiveInteger(firstDefined(
      sourcePayload.number,
      sourcePayload.prNumber,
      pullRequest.number,
      pullRequest.prNumber,
    )),
    branchName: normalizeBranchName(sourcePayload, pullRequest),
    issueKey: extractIssueKey(sourcePayload, pullRequest),
    prStatus: normalizePullRequestStatus(pullRequest),
    mergeStatus: normalizeMergeStatus(pullRequest),
    diffSummary: normalizeDiffSummary(sourcePayload, pullRequest, changedFiles),
    changedFiles,
  };
}

module.exports = {
  extractIssueKeyFromText,
  normalizeChangedFiles,
  normalizeDiffSummary,
  normalizePullRequestData,
  normalizePullRequestStatus,
  normalizeMergeStatus,
};