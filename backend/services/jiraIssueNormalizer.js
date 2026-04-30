function asTrimmedString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
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

function extractDocumentText(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return asTrimmedString(value);
  }

  if (Array.isArray(value)) {
    const text = value
      .map(extractDocumentText)
      .filter(Boolean)
      .join('\n');

    return asTrimmedString(text);
  }

  if (typeof value === 'object') {
    const directText = asTrimmedString(value.text);
    if (directText) {
      return directText;
    }

    if (Array.isArray(value.content)) {
      const contentText = value.content
        .map(extractDocumentText)
        .filter(Boolean)
        .join('\n');

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
      const resolved = asTrimmedString(candidate.id)
        || asTrimmedString(candidate.sprintId)
        || asTrimmedString(candidate.name);
      if (resolved) {
        return resolved;
      }
      continue;
    }

    const resolved = asTrimmedString(candidate);
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
    assignee.name,
    assignee.emailAddress,
    assignee.displayName,
  ];

  for (const candidate of candidates) {
    const resolved = asTrimmedString(candidate);
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
    sprintId: extractSprintId(issue, fields, options.fallbackSprintId ?? null),
  };
}

module.exports = {
  normalizeJiraIssue,
};
