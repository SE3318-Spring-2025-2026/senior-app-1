// evaluationAggregationService.js
// Aggregates story data, PR data, and sprint history for evaluation input

const storyDataService = require('./storyDataService');
const prDataService = require('./prDataService');
const sprintHistoryService = require('./sprintHistoryService');

// Helper: Extract Jira Issue Key from branch name
function extractIssueKeyFromBranch(branchName) {
  const match = branchName && branchName.match(/[A-Z]+-\d+/);
  return match ? match[0] : null;
}

async function aggregateEvaluationInput(teamId, sprintId) {
  // Fetch all data in parallel, tolerate missing data
  const [storyDataResult, prDataResult, sprintHistoryResult] = await Promise.allSettled([
    storyDataService.getStories(teamId, sprintId),
    prDataService.getPullRequests(teamId, sprintId),
    sprintHistoryService.getHistory(teamId, sprintId)
  ]);

  const storyData = storyDataResult.status === 'fulfilled' ? storyDataResult.value : [];
  const prData = prDataResult.status === 'fulfilled' ? prDataResult.value : [];
  const sprintHistory = sprintHistoryResult.status === 'fulfilled' ? sprintHistoryResult.value : null;

  // Mapping: Link PRs to stories
  const issueKeyToStory = {};
  for (const story of storyData) {
    if (story.issueKey) issueKeyToStory[story.issueKey] = story;
    story.linkedPrs = [];
  }

  const unlinkedPrs = [];
  for (const pr of prData) {
    let matched = false;
    // 1. Direct issueKey on PR
    if (pr.issueKey && issueKeyToStory[pr.issueKey]) {
      issueKeyToStory[pr.issueKey].linkedPrs.push(pr);
      matched = true;
    }
    // 2. Branch name
    else {
      const branchIssueKey = extractIssueKeyFromBranch(pr.branchName);
      if (branchIssueKey && issueKeyToStory[branchIssueKey]) {
        issueKeyToStory[branchIssueKey].linkedPrs.push(pr);
        matched = true;
      }
    }
    // 3. relatedIssueKeys array
    if (!matched && Array.isArray(pr.relatedIssueKeys)) {
      for (const key of pr.relatedIssueKeys) {
        if (issueKeyToStory[key]) {
          issueKeyToStory[key].linkedPrs.push(pr);
          matched = true;
        }
      }
    }
    // If still not matched, add to unlinkedPrs
    if (!matched) {
      unlinkedPrs.push(pr);
    }
  }

  return {
    teamId,
    sprintId,
    storyData,
    unlinkedPrs,
    sprintHistory
  };
}

module.exports = { aggregateEvaluationInput };
