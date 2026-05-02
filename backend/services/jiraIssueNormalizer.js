function asTrimmedString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function asIdentifierString(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return asTrimmedString(value);
}

function asTextFragment(value) {
  if (typeof value !== 'string') {
    return null;
  }

  return value.trim() === '' ? null : value;
}

function asNullableNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function extractDocumentText(value, joinWith = '\n') {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return asTextFragment(value);
  }

  if (Array.isArray(value)) {
    const text = value
      .map((entry) => extractDocumentText(entry, joinWith))
      .filter(Boolean)
      .join(joinWith);

    return asTrimmedString(text);
  }

  if (typeof value === 'object') {
    const directText = asTextFragment(value.text);
    if (directText) {
      return directText;
    }

    if (Array.isArray(value.content)) {
      const childJoiner = value.type === 'paragraph' ? '' : '\n';
      const contentText = value.content
        .map((entry) => extractDocumentText(entry, childJoiner))
        .filter(Boolean)
        .join(childJoiner);

      return asTrimmedString(contentText);
    }
  }

  return null;
}

function extractSprintId(issue, fields, fallbackSprintId) {
  const sprintCandidates = [
    issue.sprintId,
    issue.sprint,
    fields.sprintId,
    fields.sprint,
    fields.customfield_10020,
    fallbackSprintId,
  ];

  for (const candidate of sprintCandidates) {
    if (Array.isArray(candidate)) {
      const activeSprint = candidate.find((entry) => {
        const state = asTrimmedString(entry?.state);
        return state && state.toUpperCase() === 'ACTIVE';
      });

      const resolved = extractSprintId(
        { sprintId: activeSprint || candidate[candidate.length - 1] },
        {},
        null,
      );
      if (resolved) {
        return resolved;
      }
      continue;
    }

    if (candidate && typeof candidate === 'object') {
      const resolved = asIdentifierString(candidate.id)
        || asIdentifierString(candidate.sprintId)
        || asTrimmedString(candidate.name);
      if (resolved) {
        return resolved;
      }
      continue;
    }

    const resolved = asIdentifierString(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function extractAssigneeId(issue, fields) {
  const assignee = issue.assignee || fields.assignee || {};
  const candidates = [
    issue.assigneeId,
    assignee.accountId,
    assignee.id,
    assignee.key,
  ];

  for (const candidate of candidates) {
    const resolved = asIdentifierString(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function extractReporterId(issue, fields) {
  const reporter = issue.reporter || fields.reporter || {};
  const candidates = [
    issue.reporterId,
    reporter.accountId,
    reporter.id,
    reporter.key,
  ];

  for (const candidate of candidates) {
    const resolved = asIdentifierString(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function extractStoryPoints(issue, fields) {
  const candidates = [
    issue.storyPoints,
    issue.storyPoint,
    fields.storyPoints,
    fields.storyPoint,
    fields.points,
    fields.customfield_10016,
    fields.customfield_storyPoints,
    fields.customfield_story_point,
  ];

  for (const candidate of candidates) {
    const resolved = asNullableNumber(candidate);
    if (resolved !== null) {
      return resolved;
    }
  }

  return null;
}

function normalizeStatus(issue, fields) {
  const rawStatus = issue.status || fields.status;
  const value = typeof rawStatus === 'object' && rawStatus !== null
    ? rawStatus.name || rawStatus.statusCategory?.name
    : rawStatus;

  const normalized = asTrimmedString(value);
  if (!normalized) {
    return 'UNKNOWN';
  }

  return normalized
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .toUpperCase();
}

function normalizeJiraIssue(rawIssue, options = {}) {
  const issue = rawIssue && typeof rawIssue === 'object' ? rawIssue : {};
  const fields = issue.fields && typeof issue.fields === 'object' ? issue.fields : {};

  return {
    issueKey: asTrimmedString(issue.issueKey)
      || asTrimmedString(issue.key)
      || asTrimmedString(fields.issueKey)
      || null,
    title: asTrimmedString(issue.title)
      || asTrimmedString(fields.summary)
      || asTrimmedString(fields.title)
      || null,
    description: extractDocumentText(issue.description)
      || extractDocumentText(fields.description),
    status: normalizeStatus(issue, fields),
    storyPoints: extractStoryPoints(issue, fields),
    assigneeId: extractAssigneeId(issue, fields),
    reporterId: extractReporterId(issue, fields),
    sprintId: extractSprintId(issue, fields, options.fallbackSprintId ?? null),
    sourceCreatedAt: asTrimmedString(issue.createdAt)
      || asTrimmedString(issue.created)
      || asTrimmedString(fields.created)
      || null,
    sourceUpdatedAt: asTrimmedString(issue.updatedAt)
      || asTrimmedString(issue.updated)
      || asTrimmedString(fields.updated)
      || null,
  };
}

module.exports = {
  normalizeJiraIssue,
};
