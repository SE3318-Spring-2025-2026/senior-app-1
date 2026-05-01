# GitHub API Client Implementation - Issue #287

## Overview

This implementation provides a reusable GitHub API client that communicates with GitHub using stored integration configuration and supports PR verification workflows. The solution follows clean architecture principles with proper separation of concerns.

## Components Implemented

### 1. GitHub API Client Service (`services/githubApiClientService.js`)

The core service that handles all GitHub API interactions.

**Key Features:**
- **Non-hardcoded configuration**: Accepts GitHub token, organization name, and repository name as constructor parameters
- **Authenticated requests**: Uses token-based authentication for all GitHub API calls
- **Error handling**: Comprehensive error handling for:
  - Invalid/expired tokens (401 Unauthorized)
  - Rate limiting (403 Forbidden with reset information)
  - Missing resources (404 Not Found)
  - Server errors (5xx responses)
  - Network errors
- **PR data fetching**:
  - `getPullRequestsByBranch(branchName)`: Fetches PRs for a specific branch
  - `getPullRequestsByIssueKeys(issueKeys)`: Fetches PRs related to specific issue keys
  - `getPullRequestDetails(prNumber)`: Gets detailed PR information
  - `getPullRequestChangedFiles(prNumber)`: Retrieves list of changed files
  - `getCompletePullRequestData(prNumber)`: Combines all PR information
- **Token verification**: `verifyToken()` method to validate GitHub token

**Normalized Response Format:**
```javascript
{
  prNumber: 142,
  issueKey: "SPM-214",
  branchName: "feature/SPM-214-evaluation-endpoint",
  prStatus: "MERGED|OPEN|CLOSED|DRAFT",
  mergeStatus: "MERGED|MERGEABLE|MERGE_CONFLICT|UNKNOWN",
  diffSummary: "Added evaluation controller, service, ...",
  changedFiles: ["src/modules/sprint-monitoring/evaluation.controller.ts", ...],
  url: "https://github.com/...",
  createdAt: "2026-04-23T12:00:00Z",
  updatedAt: "2026-04-23T12:20:00Z",
  mergedAt: "2026-04-23T12:30:00Z"
}
```

### 2. GitHub PR Data Service (`services/githubPrDataService.js`)

Orchestrates the GitHub verification workflow by managing team configuration and client initialization.

**Key Functions:**
- `getTeamGitHubConfig(teamId)`: Retrieves team's integration configuration
- `createTeamGitHubClient(teamId)`: Creates configured GitHub API client for a team
- `getPullRequestsByBranches(teamId, branchNames)`: Fetches PRs for branches
- `getPullRequestsByIssueKeys(teamId, issueKeys)`: Fetches PRs for issue keys
- `getTeamPullRequestData(teamId, options)`: Unified interface to fetch all PR data
- `verifyTeamGitHubToken(teamId)`: Validates team's GitHub token

**Features:**
- Validates team exists and has GitHub integration configured
- Handles token retrieval from stored references
- Deduplicates PR results when fetching by both branches and issue keys
- Graceful error handling with meaningful error messages
- Continues processing other branches/issues if one fails

### 3. GitHub PR Data Controller (`controllers/githubPrDataController.js`)

REST API endpoints for receiving and processing GitHub verification requests.

**Endpoints:**
- `POST /api/v1/internal/github/pr-data`: Main endpoint to receive GitHub PR data fetch requests
- `GET /api/v1/internal/github/pr-data/:teamId`: On-demand PR data fetching

**Request Body (POST):**
```javascript
{
  operationId: "uuid",
  teamId: "team_id",
  sprintId: "sprint_id",
  branchNames: ["feature/SPM-214-evaluation-endpoint"],
  relatedIssueKeys: ["SPM-214", "SPM-219"],
  requestedBy: "user_id"
}
```

**Response:**
```javascript
{
  code: "ACCEPTED",
  message: "GitHub PR data received and processed",
  data: {
    operationId: "uuid",
    teamId: "team_id",
    sprintId: "sprint_id",
    receivedAt: "2026-04-23T12:20:00Z",
    pullRequests: [
      {
        prNumber: 142,
        issueKey: "SPM-214",
        branchName: "feature/SPM-214-evaluation-endpoint",
        prStatus: "MERGED",
        mergeStatus: "MERGED",
        diffSummary: "Added evaluation endpoint",
        changedFiles: ["src/modules/sprint-monitoring/evaluation.controller.ts"],
        url: "https://github.com/...",
        createdAt: "2026-04-23T12:00:00Z",
        updatedAt: "2026-04-23T12:30:00Z",
        mergedAt: "2026-04-23T12:30:00Z"
      }
    ],
    fetchError: null
  }
}
```

### 4. Routes (`routes/internalIntegrations.js`)

Registered routes for internal GitHub integration endpoints.

## Architecture

```
githubVerificationController (triggers verification)
    ↓
    receiveGitHubPrData endpoint
    ↓
    githubPrDataService (orchestration layer)
    ├── getTeamGitHubConfig (retrieve team config from DB)
    ├── getGitHubTokenFromRef (retrieve token)
    └── createTeamGitHubClient (instantiate GitHub API client)
        ↓
        githubApiClientService (GitHub API interactions)
        ├── getPullRequestsByBranch
        ├── getPullRequestsByIssueKeys
        ├── getPullRequestDetails
        ├── getPullRequestChangedFiles
        └── Error handling (token validation, rate limits, etc.)
```

## Acceptance Criteria Fulfillment

✅ **Client can be reused by GitHub verification workflow**
- The GitHub API client is instantiated through `createTeamGitHubClient` and can be used by any workflow
- Multiple clients can be created for different teams

✅ **Client does not contain hardcoded organization, repository, or token values**
- All configuration values are passed as parameters to constructors
- Token is retrieved from the database at runtime

✅ **Handles invalid/expired tokens gracefully**
- Returns `401 UNAUTHORIZED` with code `GITHUB_AUTHENTICATION_FAILED`
- `verifyToken()` method allows proactive token validation

✅ **Handles GitHub rate limit responses without crashing**
- Detects 403 responses with rate limit headers
- Returns `400 GITHUB_RATE_LIMIT_EXCEEDED` with reset time information
- Application continues processing

✅ **Returns normalized PR data including required fields**
- `prNumber`: PR number
- `branchName`: Branch name
- `issueKey`: Extracted from PR title
- `prStatus`: MERGED, OPEN, CLOSED, or DRAFT
- `mergeStatus`: MERGED, MERGEABLE, MERGE_CONFLICT, or UNKNOWN
- `diffSummary`: PR title
- `changedFiles`: Array of file paths
- Additional metadata: URL, timestamps

✅ **Errors are returned using common API error response model**
- Uses `ApiError` class from `errors/apiError.js`
- Consistent error response format with code and message
- Proper HTTP status codes (400, 401, 403, 404, 500)

## Error Handling

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| GITHUB_AUTHENTICATION_FAILED | 401 | Invalid or expired GitHub token |
| GITHUB_RATE_LIMIT_EXCEEDED | 400 | Rate limit exceeded with reset time |
| GITHUB_RESOURCE_NOT_FOUND | 404 | PR, branch, or other resource not found |
| GITHUB_API_ERROR | 400 | Generic GitHub API error |
| INTEGRATION_NOT_FOUND | 404 | No GitHub integration for team |
| GITHUB_NOT_CONFIGURED | 400 | GitHub not in provider set |
| GITHUB_TOKEN_NOT_FOUND | 400 | Token reference missing |
| VALIDATION_ERROR | 400 | Request validation failed |
| INTERNAL_ERROR | 500 | Unexpected server error |

## Usage Examples

### Using GitHub API Client Directly

```javascript
const { createGitHubApiClient } = require('./services/githubApiClientService');

// Create client
const client = createGitHubApiClient(
  'github_token_here',
  'organization-name',
  'repository-name'
);

// Fetch PRs by branch
const branchPRs = await client.getPullRequestsByBranch('feature/SPM-214');

// Fetch complete PR data
const prData = await client.getCompletePullRequestData(142);

// Verify token
const isValid = await client.verifyToken();
```

### Using GitHub PR Data Service

```javascript
const { getTeamPullRequestData } = require('./services/githubPrDataService');

// Fetch all PR data for a team
const pullRequests = await getTeamPullRequestData(teamId, {
  branchNames: ['feature/SPM-214', 'feature/SPM-219'],
  issueKeys: ['SPM-214', 'SPM-219']
});
```

### Calling the API Endpoint

```bash
curl -X POST http://localhost:3000/api/v1/internal/github/pr-data \
  -H "Authorization: Bearer <internal_api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "operationId": "op-12345",
    "teamId": "team-123",
    "sprintId": "sprint-001",
    "branchNames": ["feature/SPM-214"],
    "relatedIssueKeys": ["SPM-214"],
    "requestedBy": "user-123"
  }'
```

## Testing

Comprehensive unit tests are provided in `test/issue287-github-api-client.test.js`:

```bash
npm test test/issue287-github-api-client.test.js
```

Tests verify:
- Client initialization with required parameters
- Error handling for missing parameters
- PR data normalization logic
- Issue key extraction
- PR status determination
- Merge status determination
- No hardcoded values in client

## Security Considerations

1. **Token Storage**: Tokens are stored in `IntegrationTokenReference` table and should be encrypted at rest
2. **Token Transmission**: Always use HTTPS for API communication
3. **API Keys**: Internal endpoints require `internalApiKey` authentication
4. **Rate Limiting**: GitHub API rate limits (60 requests/hour unauthenticated, 5000 for authenticated)
5. **Error Messages**: Avoid exposing sensitive information in error messages

## Dependencies

- `node-fetch` or native `fetch` (Node 18+): For HTTP requests
- `sequelize`: For database queries
- `express-validator`: For request validation
- `express`: For HTTP routing

## Future Enhancements

1. **Token Refresh**: Implement automatic GitHub token refresh when expired
2. **Caching**: Add caching layer for frequently accessed PR data
3. **Pagination**: Handle large PR lists with pagination
4. **Webhooks**: Listen for GitHub webhook events for real-time updates
5. **Batch Operations**: Support batch PR data requests for efficiency
6. **Metrics**: Track PR metrics (review time, merge time, etc.)
7. **Pull Request Comments**: Fetch and analyze PR review comments
8. **Status Checks**: Monitor CI/CD status checks on PRs

## Related Issues

- Issue #286: Create GitHub PR fetch endpoint
- Issue #296: Add endpoint to retrieve integration configuration
