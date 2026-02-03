/**
 * GEMINI INTEGRATION MODULE
 * =========================
 * Google Gemini Flash 2.5 for narration
 *
 * CRITICAL: Gemini NEVER invents numbers
 * It only narrates and explains data we provide
 */

const logger = require('../utils/logger');
const prompts = require('../config/gemini-prompts');

// ============================================================
// CONFIGURATION
// ============================================================

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const DEFAULT_CONFIG = {
  temperature: 0.3, // Low temperature for consistency
  maxOutputTokens: 500,
  topP: 0.8,
  topK: 40
};

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Check if Gemini is enabled
 */
function isEnabled() {
  return !!(process.env.GEMINI_API_KEY);
}

/**
 * Generate content from Gemini
 */
async function generate(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    logger.debug('Gemini API key not configured');
    return null;
  }

  // Check cache
  const cacheKey = hashString(prompt);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug('Returning cached Gemini response');
    return cached.content;
  }

  const config = { ...DEFAULT_CONFIG, ...options };

  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      topP: config.topP,
      topK: config.topK
    },
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE'
      }
    ]
  };

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Gemini API error', {
        status: response.status,
        error: errorText
      });
      return null;
    }

    const data = await response.json();

    // Extract text from response
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      logger.warn('Gemini returned empty content');
      return null;
    }

    // Cache the result
    cache.set(cacheKey, {
      content,
      timestamp: Date.now()
    });

    logger.debug('Gemini response received', { length: content.length });
    return content;
  } catch (error) {
    logger.error('Gemini request failed', { error: error.message });
    return null;
  }
}

/**
 * Simple string hash for caching
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

// ============================================================
// NARRATION FUNCTIONS
// ============================================================

/**
 * Narrate daily briefing data
 */
async function narrateDailyBriefing(data) {
  if (!isEnabled()) {
    return prompts.getFallback('dailyBriefing');
  }

  const prompt = prompts.buildPrompt('dailyBriefing', sanitizeData(data));
  return generate(prompt);
}

/**
 * Narrate weekly war room data
 */
async function narrateWeeklyWarRoom(data) {
  if (!isEnabled()) {
    return prompts.getFallback('weeklyWarRoom');
  }

  const prompt = prompts.buildPrompt('weeklyWarRoom', sanitizeData(data));
  return generate(prompt, { maxOutputTokens: 600 });
}

/**
 * Add context to an alert
 */
async function narrateAlert(data) {
  if (!isEnabled()) {
    return prompts.getFallback('alert');
  }

  const prompt = prompts.buildPrompt('alert', sanitizeData(data));
  return generate(prompt, { maxOutputTokens: 150 });
}

/**
 * Explain confluence score
 */
async function explainConfluence(data) {
  if (!isEnabled()) {
    return prompts.getFallback('confluence');
  }

  const prompt = prompts.buildPrompt('confluence', sanitizeData(data));
  return generate(prompt, { maxOutputTokens: 200 });
}

/**
 * Explain Gann levels
 */
async function explainGann(data) {
  if (!isEnabled()) {
    return prompts.getFallback('gann');
  }

  const prompt = prompts.buildPrompt('gann', sanitizeData(data));
  return generate(prompt, { maxOutputTokens: 250 });
}

/**
 * Explain planetary timing
 */
async function explainPlanetary(data) {
  if (!isEnabled()) {
    return prompts.getFallback('planetary');
  }

  const prompt = prompts.buildPrompt('planetary', sanitizeData(data));
  return generate(prompt, { maxOutputTokens: 250 });
}

/**
 * Analyze prediction outcome
 */
async function analyzeOutcome(data) {
  if (!isEnabled()) {
    return prompts.getFallback('outcome');
  }

  const prompt = prompts.buildPrompt('outcome', sanitizeData(data));
  return generate(prompt, { maxOutputTokens: 200 });
}

/**
 * Summarize calibration results
 */
async function summarizeCalibration(data) {
  if (!isEnabled()) {
    return prompts.getFallback('calibration');
  }

  const prompt = prompts.buildPrompt('calibration', sanitizeData(data));
  return generate(prompt, { maxOutputTokens: 250 });
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Sanitize data for prompt injection
 * Removes functions, circular refs, and limits depth
 */
function sanitizeData(data, depth = 0) {
  if (depth > 5) return '[max depth]';

  if (data === null || data === undefined) {
    return null;
  }

  if (typeof data === 'function') {
    return '[function]';
  }

  if (typeof data === 'number') {
    // Round to reasonable precision
    if (Number.isFinite(data)) {
      return Math.abs(data) > 0.0001 ? Number(data.toFixed(6)) : data;
    }
    return null;
  }

  if (typeof data === 'string' || typeof data === 'boolean') {
    return data;
  }

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (Array.isArray(data)) {
    return data.slice(0, 20).map(item => sanitizeData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const sanitized = {};
    const keys = Object.keys(data).slice(0, 50);
    for (const key of keys) {
      sanitized[key] = sanitizeData(data[key], depth + 1);
    }
    return sanitized;
  }

  return String(data);
}

/**
 * Clear the cache
 */
function clearCache() {
  cache.clear();
  logger.debug('Gemini cache cleared');
}

/**
 * Get cache stats
 */
function getCacheStats() {
  return {
    size: cache.size,
    enabled: isEnabled()
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Core
  isEnabled,
  generate,

  // Narration
  narrateDailyBriefing,
  narrateWeeklyWarRoom,
  narrateAlert,
  explainConfluence,
  explainGann,
  explainPlanetary,
  analyzeOutcome,
  summarizeCalibration,

  // Utilities
  sanitizeData,
  clearCache,
  getCacheStats
};
