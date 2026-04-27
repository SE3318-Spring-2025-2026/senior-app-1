const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../db');
const LinkedGitHubAccount = require('../models/LinkedGitHubAccount');
const OAuthState = require('../models/OAuthState');
const User = require('../models/User');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function hasRealGitHubOAuthConfig() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function buildAuthorizationUrl(state) {
  // GitHub expects the generated state to round-trip through the authorize screen
  // so we can validate that the callback belongs to the original student session.
  if (!hasRealGitHubOAuthConfig()) {
    // In local dev without GitHub OAuth credentials, we short-circuit to the
    // backend callback so the rest of the linking pipeline can still be tested
    // without sending the browser to a broken GitHub authorize URL.
    const params = new URLSearchParams({
      code: `mock-code-${state}`,
      state,
    });

    return `/api/v1/auth/github/callback?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    scope: 'read:user',
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

function normalizeFrontendReturnUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/home';
  }
  return url.toString();
}

function getFrontendUrl() {
  if (process.env.FRONTEND_GITHUB_RETURN_URL) {
    return normalizeFrontendReturnUrl(process.env.FRONTEND_GITHUB_RETURN_URL);
  }

  if (process.env.FRONTEND_URL) {
    return normalizeFrontendReturnUrl(process.env.FRONTEND_URL);
  }

  return 'http://localhost:5173/home';
}

async function createOAuthState(userId) {
  // A short-lived random state is stored server-side so the callback can be
  // mapped back to the student who initiated the linking flow.
  const state = crypto.randomBytes(24).toString('hex');
  await OAuthState.create({
    state,
    userId,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });

  return state;
}

async function consumeOAuthState(state) {
  // State is one-time-use: once consumed successfully it becomes invalid so the
  // same callback URL cannot be replayed to link accounts multiple times.
  const oauthState = await OAuthState.findOne({
    where: {
      state,
      consumedAt: null,
      expiresAt: {
        [Op.gt]: new Date(),
      },
    },
  });

  if (!oauthState) {
    return null;
  }

  oauthState.consumedAt = new Date();
  await oauthState.save();
  return oauthState;
}

async function exchangeCodeForToken(code) {
  if (!hasRealGitHubOAuthConfig()) {
    // The mock path keeps local development and tests usable when real GitHub
    // OAuth credentials are intentionally absent.
    return `mock-token-${code}`;
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error('GitHub token exchange failed.');
  }

  return payload.access_token;
}

async function fetchGitHubProfile(accessToken, user) {
  if (!hasRealGitHubOAuthConfig()) {
    // Tests and local dry-runs use deterministic mock identities so the rest of
    // the linking pipeline can still be exercised without external API calls.
    return {
      githubId: `mock-gh-${user.studentId}`,
      githubUsername: `student-${user.studentId}`,
    };
  }

  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch GitHub profile.');
  }

  const payload = await response.json();
  return {
    githubId: String(payload.id),
    githubUsername: payload.login,
  };
}

async function storeLinkedGitHubAccount({ studentId, githubId, githubUsername }) {
  return sequelize.transaction(async (transaction) => {
    // The linked-account write and the student profile update happen in one
    // transaction so the database cannot end up half-linked.
    const student = await User.findOne({
      where: {
        studentId,
        role: 'STUDENT',
      },
      transaction,
    });

    if (!student) {
      const error = new Error('Student not found.');
      error.code = 'STUDENT_NOT_FOUND';
      throw error;
    }

    const existingByGitHubId = await LinkedGitHubAccount.findOne({
      where: { githubId },
      transaction,
    });
    // One GitHub account must never be attached to two different students.
    if (existingByGitHubId && existingByGitHubId.userId !== student.id) {
      const error = new Error('GitHub account is already linked to another student.');
      error.code = 'GITHUB_ACCOUNT_ALREADY_LINKED';
      throw error;
    }

    const existingLinkedAccount = await LinkedGitHubAccount.findOne({
      where: { userId: student.id },
      transaction,
    });

    if (
      existingLinkedAccount &&
      existingLinkedAccount.githubId === githubId &&
      existingLinkedAccount.githubUsername === githubUsername &&
      student.githubLinked
    ) {
      const error = new Error('GitHub account is already linked for this student.');
      error.code = 'GITHUB_ACCOUNT_ALREADY_LINKED_FOR_STUDENT';
      throw error;
    }

    if (existingLinkedAccount) {
      const error = new Error('A GitHub account is already linked for this student. Unlink is required before linking a different account.');
      error.code = 'GITHUB_RELINK_NOT_ALLOWED';
      throw error;
    }

    let linkedAccount;
    linkedAccount = await LinkedGitHubAccount.create({
      userId: student.id,
      githubId,
      githubUsername,
    }, { transaction });

    student.githubUsername = githubUsername;
    student.githubLinked = true;
    await student.save({ transaction });

    return { linkedAccount, student };
  });
}

module.exports = {
  buildAuthorizationUrl,
  consumeOAuthState,
  createOAuthState,
  exchangeCodeForToken,
  fetchGitHubProfile,
  getFrontendUrl,
  hasRealGitHubOAuthConfig,
  storeLinkedGitHubAccount,
};
