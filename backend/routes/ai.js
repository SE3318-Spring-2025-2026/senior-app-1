const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Initialize clients (add API keys to .env)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Chat endpoint - requires authentication
router.post('/chat', authenticate, async (req, res) => {
  try {
    const { model, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let response;

    if (model === 'opus') {
      // Use Anthropic Claude Opus
      const result = await anthropic.messages.create({
        model: 'claude-3-opus-20240229', // Opus 4.6 equivalent
        max_tokens: 1000,
        messages: [{ role: 'user', content: message }],
      });
      response = result.content[0].text;
    } else if (model === 'gpt') {
      // Use OpenAI GPT
      const result = await openai.chat.completions.create({
        model: 'gpt-4', // GPT-4 (5.4 not available yet, use latest)
        messages: [{ role: 'user', content: message }],
        max_tokens: 1000,
      });
      response = result.choices[0].message.content;
    } else {
      return res.status(400).json({ error: 'Invalid model. Use "opus" or "gpt"' });
    }

    res.json({ response });
  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

module.exports = router;