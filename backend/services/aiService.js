'use strict';

/**
 * Thin wrapper around an LLM provider for the project's two AI features:
 *   - PR review verification (was a real code review left on this PR?)
 *   - Issue implementation validation (do the diffs match the JIRA issue?)
 *
 * Two providers are supported, picked via LLM_PROVIDER env (default: ollama):
 *   - "ollama"    → local Ollama daemon, no cloud credits required.
 *                   Uses OLLAMA_BASE_URL (default http://localhost:11434) and
 *                   OLLAMA_MODEL (default qwen2.5-coder:1.5b).
 *   - "anthropic" → Anthropic Claude API. Needs ANTHROPIC_API_KEY +
 *                   ANTHROPIC_MODEL.
 *
 * When the configured provider is unreachable or its credentials are missing,
 * every call returns a deterministic AI_UNAVAILABLE result. Callers persist
 * that instead of throwing — the rest of the grading pipeline keeps working.
 */

const PROVIDER = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:1.5b';

const DEFAULT_MODEL = PROVIDER === 'anthropic' ? ANTHROPIC_MODEL : OLLAMA_MODEL;

let cachedAnthropic = null;
let cachedAnthropicError = null;

function getAnthropicClient() {
  if (cachedAnthropic || cachedAnthropicError) {
    return { client: cachedAnthropic, error: cachedAnthropicError };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    cachedAnthropicError = new Error('ANTHROPIC_API_KEY is not set');
    cachedAnthropicError.code = 'AI_UNAVAILABLE';
    return { client: null, error: cachedAnthropicError };
  }
  try {
    const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
    cachedAnthropic = new Anthropic({ apiKey });
    return { client: cachedAnthropic, error: null };
  } catch (err) {
    cachedAnthropicError = err;
    return { client: null, error: err };
  }
}

function isAvailable() {
  if (PROVIDER === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  // For Ollama we can't cheaply probe the daemon synchronously, so we report
  // "available" optimistically. classifyXxx() returns AI_UNAVAILABLE if the
  // call actually fails.
  return true;
}

function resetForTests() {
  cachedAnthropic = null;
  cachedAnthropicError = null;
}

function extractAnthropicText(message) {
  if (!message || !Array.isArray(message.content)) return '';
  return message.content
    .filter((block) => block && block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/**
 * Call Ollama with optional JSON-schema-constrained output. Passing a schema
 * forces small instruction-tuned models (qwen2.5:0.5b, llama3.2:1b, …) to
 * emit valid JSON whose enum fields are picked from the allowed set, rather
 * than parroting back the schema literal.
 * See https://ollama.com/blog/structured-outputs.
 */
async function callOllama({ system, user, schema = null }) {
  const url = `${OLLAMA_BASE_URL}/api/chat`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format: schema || 'json',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      options: { temperature: 0 },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(`Ollama ${response.status}: ${text.slice(0, 200)}`);
    err.code = 'AI_ERROR';
    throw err;
  }
  const json = await response.json();
  return (json?.message?.content || '').trim();
}

async function callAnthropic({ system, user, maxTokens }) {
  const { client } = getAnthropicClient();
  if (!client) {
    const err = new Error('Anthropic client not configured');
    err.code = 'AI_UNAVAILABLE';
    throw err;
  }
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return extractAnthropicText(message);
}

async function callLlm({ system, user, maxTokens, schema = null }) {
  if (PROVIDER === 'anthropic') {
    return callAnthropic({ system, user, maxTokens });
  }
  return callOllama({ system, user, schema });
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    reviewed: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasoning: { type: 'string' },
  },
  required: ['reviewed', 'confidence', 'reasoning'],
};

const VALIDATION_SCHEMA = {
  type: 'object',
  properties: {
    validationStatus: {
      type: 'string',
      enum: ['MATCHED', 'PARTIAL_MATCH', 'NOT_MATCHED'],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    feedback: { type: 'string' },
  },
  required: ['validationStatus', 'confidence', 'feedback'],
};

function safeJsonParse(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

const REVIEW_SYSTEM_PROMPT = [
  'You audit GitHub pull-request review activity for the senior-app-1',
  'course project. Given the PR title, description, and the list of review',
  'comments, decide whether a genuine code review took place.',
  '',
  'A genuine review (per the team\'s conventions in docs/CONTRIBUTING.md):',
  '  • at least one comment must come from a reviewer who is NOT the PR author',
  '  • the comment body must be substantive — it discusses the code, requests',
  '    a change, or points out a bug. Empty bodies, single "LGTM", "approved",',
  '    or auto-generated bot messages do NOT count as substantive.',
  '  • if there are zero review entries with a non-author author, it is not',
  '    reviewed regardless of approval state.',
  '',
  'Reason from the actual review array provided in the user message:',
  '  • Count entries whose author is different from the PR author and whose',
  '    body has more than a trivial sentence of feedback.',
  '  • If that count is 0, "reviewed" must be false.',
  '  • If that count is ≥ 1, "reviewed" must be true.',
  'Reasoning must reference the actual review entries — quote the author name',
  'or the review state — not the abstract concept of a review.',
].join('\n');

async function classifyPrReview({ prTitle, prDescription, reviews }) {
  const reviewSummary = (reviews || []).map((review, index) => ({
    index,
    author: review.author || 'unknown',
    state: review.state || 'COMMENTED',
    submittedAt: review.submittedAt || null,
    body: typeof review.body === 'string' ? review.body.slice(0, 4000) : '',
  }));

  const userPayload = JSON.stringify(
    {
      prTitle: prTitle || '',
      prDescription: (prDescription || '').slice(0, 4000),
      reviews: reviewSummary,
    },
    null,
    2,
  );

  let text;
  try {
    text = await callLlm({
      system: REVIEW_SYSTEM_PROMPT,
      user: userPayload,
      maxTokens: 256,
      schema: REVIEW_SCHEMA,
    });
  } catch (err) {
    return {
      status: err.code === 'AI_UNAVAILABLE' ? 'AI_UNAVAILABLE' : 'AI_ERROR',
      confidence: 0,
      reasoning: `${PROVIDER} error: ${err.message || 'unknown'}`,
    };
  }

  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed.reviewed !== 'boolean') {
    return {
      status: 'AI_PARSE_ERROR',
      confidence: 0,
      reasoning: `Could not parse model output: ${(text || '').slice(0, 200)}`,
    };
  }
  return {
    status: parsed.reviewed ? 'REVIEWED' : 'NOT_REVIEWED',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}

const VALIDATION_SYSTEM_PROMPT = [
  'You audit pull requests against the JIRA issue they claim to implement,',
  'using the conventions of the senior-app-1 project (Express + Sequelize + React).',
  '',
  'Project conventions you must check against (from docs/CONTRIBUTING.md):',
  '  • Backend endpoint changes need: model file under backend/models/,',
  '    registration in backend/models/index.js, service in backend/services/,',
  '    controller (with express-validator) in backend/controllers/, route',
  '    wired with authenticate + authorize, mount line in backend/app.js,',
  '    test file in backend/test/, AND that test file added to the "test"',
  '    script in backend/package.json.',
  '  • Frontend page changes need: a *Page.jsx default-exported component,',
  '    a Route entry in frontend/src/App.jsx, an AppShell.jsx sidebar entry',
  '    where applicable, and API calls done through services/apiClient.js',
  '    (never raw fetch in components).',
  '  • UUID primary keys for new models (except User which is INTEGER).',
  '  • Audit logging is fire-and-forget (.catch, never await).',
  '',
  'Decide whether the diffs implement the issue:',
  '  • MATCHED        — diffs implement every requirement of the issue and',
  '                     follow the conventions above.',
  '  • PARTIAL_MATCH  — diffs address part of the issue OR implement it but',
  '                     skip a required convention step (e.g. model added',
  '                     but not registered in index.js, or test file added',
  '                     but not wired into package.json, or route added',
  '                     but never mounted in app.js).',
  '  • NOT_MATCHED    — diffs are unrelated to the issue or do not',
  '                     implement what the issue asks for.',
  '',
  'Reason carefully about the actual issue text and the actual diff content',
  'before deciding. Confidence must reflect how clearly the diff matches the',
  'issue: high (≥ 0.85) only when there is no ambiguity. Feedback must name',
  'the specific files changed and the specific issue requirements covered',
  'or missing — never paste back this prompt or generic boilerplate.',
].join('\n');

async function classifyImplementation({ issueDescription, fileDiffs }) {
  const trimmedDiffs = (fileDiffs || []).map((entry) => ({
    path: entry.path || '',
    diff: typeof entry.diff === 'string' ? entry.diff.slice(0, 6000) : '',
  }));

  const userPayload = JSON.stringify(
    {
      issueDescription: (issueDescription || '').slice(0, 8000),
      fileDiffs: trimmedDiffs,
    },
    null,
    2,
  );

  // Trace data — exposed to callers so the UI can show what was actually
  // sent to the LLM and what came back. Useful when a professor asks "why
  // did the AI score this 25%?".
  const trace = {
    provider: PROVIDER,
    model: DEFAULT_MODEL,
    systemPrompt: VALIDATION_SYSTEM_PROMPT,
    userPayload,
    rawResponse: null,
    elapsedMs: null,
  };

  let text;
  const startedAt = Date.now();
  try {
    text = await callLlm({
      system: VALIDATION_SYSTEM_PROMPT,
      user: userPayload,
      maxTokens: 512,
      schema: VALIDATION_SCHEMA,
    });
    trace.elapsedMs = Date.now() - startedAt;
    trace.rawResponse = text;
  } catch (err) {
    trace.elapsedMs = Date.now() - startedAt;
    return {
      status: err.code === 'AI_UNAVAILABLE' ? 'AI_UNAVAILABLE' : 'AI_ERROR',
      confidence: 0,
      feedback: `${PROVIDER} error: ${err.message || 'unknown'}`,
      trace,
    };
  }

  const parsed = safeJsonParse(text);
  if (!parsed || !['MATCHED', 'PARTIAL_MATCH', 'NOT_MATCHED'].includes(parsed.validationStatus)) {
    return {
      status: 'AI_PARSE_ERROR',
      confidence: 0,
      feedback: `Could not parse model output: ${(text || '').slice(0, 200)}`,
      trace,
    };
  }
  return {
    status: parsed.validationStatus,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
    trace,
  };
}

module.exports = {
  isAvailable,
  classifyPrReview,
  classifyImplementation,
  resetForTests,
  DEFAULT_MODEL,
};
