/**
 * WEEKLY CALIBRATION JOB
 * ======================
 * Adjusts confluence weights based on outcome data
 * Runs Sunday at 00:00 UTC (5:30 AM IST)
 *
 * IMPORTANT: Weights are adjusted SLOWLY to prevent overfitting
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const confluence = require('../modules/confluence');
const gemini = require('../modules/gemini');
const db = require('../database/models');
const telegram = require('../bot/telegram');

// ============================================================
// CONFIGURATION
// ============================================================

// Sunday 00:00 UTC
const CRON_SCHEDULE = '0 0 * * 0';

// Calibration parameters
const CALIBRATION_CONFIG = {
  lookbackDays: 14,           // Use 2 weeks of data
  minSamples: 20,             // Minimum samples required
  maxAdjustment: 0.02,        // Max weight adjustment per week (2%)
  learningRate: 0.1,          // How fast to adjust (0.1 = 10% of ideal adjustment)
  minWeight: 0.02,            // Minimum weight for any component
  maxWeight: 0.25             // Maximum weight for any component
};

let cronJob = null;
let isRunning = false;
let lastRunTime = null;
let lastCalibrationResult = null;

// ============================================================
// PERFORMANCE ANALYSIS
// ============================================================

/**
 * Get detailed outcome data for calibration
 */
async function getOutcomeData(days) {
  try {
    const outcomes = await db.getOutcomeLabelsWithSnapshots('BTCUSDT', days);
    return outcomes || [];
  } catch (e) {
    logger.error('Failed to get outcome data', { error: e.message });
    return [];
  }
}

/**
 * Analyze component performance
 */
function analyzeComponentPerformance(outcomes) {
  const componentStats = {
    gann_sq9_cardinal: { hits: 0, total: 0, contribution: 0 },
    gann_sq9_position: { hits: 0, total: 0, contribution: 0 },
    gann_level_proximity: { hits: 0, total: 0, contribution: 0 },
    cycle_convergence: { hits: 0, total: 0, contribution: 0 },
    cycle_major_hit: { hits: 0, total: 0, contribution: 0 },
    planetary_aspect_tight: { hits: 0, total: 0, contribution: 0 },
    planetary_major_event: { hits: 0, total: 0, contribution: 0 },
    planetary_moon_phase: { hits: 0, total: 0, contribution: 0 },
    market_regime: { hits: 0, total: 0, contribution: 0 },
    market_momentum: { hits: 0, total: 0, contribution: 0 }
  };

  for (const outcome of outcomes) {
    // Get the snapshot's detailed scores
    const detailedScores = outcome.snapshot?.detailed_scores || outcome.detailed_scores;
    if (!detailedScores) continue;

    // Determine if this was a hit (use 24h as primary)
    const isHit = outcome.hit_24h === true || outcome.hit_4h === true;

    // Update stats for each component
    for (const [component, score] of Object.entries(detailedScores)) {
      if (componentStats[component] && score > 0) {
        componentStats[component].total++;
        componentStats[component].contribution += score;

        if (isHit) {
          componentStats[component].hits++;
        }
      }
    }
  }

  // Calculate hit rates
  for (const [component, stats] of Object.entries(componentStats)) {
    stats.hitRate = stats.total > 0 ? stats.hits / stats.total : 0;
    stats.avgContribution = stats.total > 0 ? stats.contribution / stats.total : 0;
  }

  return componentStats;
}

/**
 * Calculate ideal weight adjustments
 */
function calculateAdjustments(componentStats, currentWeights) {
  const adjustments = {};
  const { maxAdjustment, learningRate, minWeight, maxWeight } = CALIBRATION_CONFIG;

  // Calculate average hit rate
  const hitRates = Object.values(componentStats)
    .filter(s => s.total > 0)
    .map(s => s.hitRate);

  const avgHitRate = hitRates.length > 0
    ? hitRates.reduce((a, b) => a + b, 0) / hitRates.length
    : 0.5;

  for (const [component, stats] of Object.entries(componentStats)) {
    if (stats.total < 5) {
      // Not enough data - no adjustment
      adjustments[component] = 0;
      continue;
    }

    // Calculate performance relative to average
    const relativePerformance = stats.hitRate - avgHitRate;

    // Calculate ideal adjustment (positive if above average, negative if below)
    const idealAdjustment = relativePerformance * currentWeights[component];

    // Apply learning rate and cap
    let adjustment = idealAdjustment * learningRate;
    adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustment));

    // Ensure we stay within bounds
    const newWeight = currentWeights[component] + adjustment;
    if (newWeight < minWeight) {
      adjustment = minWeight - currentWeights[component];
    } else if (newWeight > maxWeight) {
      adjustment = maxWeight - currentWeights[component];
    }

    adjustments[component] = adjustment;
  }

  return adjustments;
}

/**
 * Normalize weights to sum to 1.0
 */
function normalizeWeights(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum === 0) return weights;

  const normalized = {};
  for (const [key, value] of Object.entries(weights)) {
    normalized[key] = value / sum;
  }
  return normalized;
}

// ============================================================
// CALIBRATION
// ============================================================

/**
 * Run the calibration
 */
async function runCalibration() {
  const timestamp = new Date();
  logger.info('Starting weekly calibration', { timestamp: timestamp.toISOString() });

  // Get outcome data
  const outcomes = await getOutcomeData(CALIBRATION_CONFIG.lookbackDays);

  if (outcomes.length < CALIBRATION_CONFIG.minSamples) {
    logger.info('Insufficient data for calibration', {
      samples: outcomes.length,
      required: CALIBRATION_CONFIG.minSamples
    });
    return {
      success: false,
      reason: 'insufficient_data',
      samples: outcomes.length
    };
  }

  // Get current weights
  const currentWeights = await confluence.getWeights();

  // Analyze component performance
  const componentStats = analyzeComponentPerformance(outcomes);

  // Calculate adjustments
  const adjustments = calculateAdjustments(componentStats, currentWeights);

  // Apply adjustments
  const newWeights = {};
  for (const [component, weight] of Object.entries(currentWeights)) {
    newWeights[component] = weight + (adjustments[component] || 0);
  }

  // Normalize
  const normalizedWeights = normalizeWeights(newWeights);

  // Calculate version
  const version = `v${timestamp.toISOString().split('T')[0].replace(/-/g, '')}`;

  // Save new weights
  const saved = await confluence.updateWeights(normalizedWeights, version);

  // Build result
  const result = {
    success: saved,
    timestamp,
    version,
    samples: outcomes.length,
    previousWeights: currentWeights,
    newWeights: normalizedWeights,
    adjustments,
    componentStats,
    overallMetrics: {
      hitRate24h: outcomes.filter(o => o.hit_24h).length / outcomes.length,
      hitRate4h: outcomes.filter(o => o.hit_4h).length / outcomes.length,
      hitRate1h: outcomes.filter(o => o.hit_1h).length / outcomes.length,
      avgReturn: outcomes.reduce((s, o) => s + (o.actual_return || 0), 0) / outcomes.length
    }
  };

  // Log significant changes
  const significantChanges = Object.entries(adjustments)
    .filter(([_, adj]) => Math.abs(adj) > 0.005)
    .map(([comp, adj]) => `${comp}: ${adj > 0 ? '+' : ''}${(adj * 100).toFixed(1)}%`);

  if (significantChanges.length > 0) {
    logger.info('Weight adjustments made', { changes: significantChanges });
  }

  return result;
}

/**
 * Send calibration report
 */
async function sendCalibrationReport(result) {
  if (!result.success) {
    logger.debug('Calibration not successful, skipping report');
    return;
  }

  // Format message
  let message = `<b>📊 Weekly Calibration Report</b>\n`;
  message += `<code>${result.timestamp.toISOString().split('T')[0]}</code>\n\n`;

  message += `<b>Performance (${CALIBRATION_CONFIG.lookbackDays}d):</b>\n`;
  message += `• 24h Hit Rate: ${(result.overallMetrics.hitRate24h * 100).toFixed(1)}%\n`;
  message += `• 4h Hit Rate: ${(result.overallMetrics.hitRate4h * 100).toFixed(1)}%\n`;
  message += `• Avg Return: ${result.overallMetrics.avgReturn >= 0 ? '+' : ''}${result.overallMetrics.avgReturn.toFixed(2)}%\n`;
  message += `• Samples: ${result.samples}\n\n`;

  // Show significant weight changes
  const changes = Object.entries(result.adjustments)
    .filter(([_, adj]) => Math.abs(adj) > 0.003)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5);

  if (changes.length > 0) {
    message += `<b>Weight Adjustments:</b>\n`;
    changes.forEach(([comp, adj]) => {
      const emoji = adj > 0 ? '📈' : '📉';
      const shortName = comp.replace('_', ' ').replace('gann ', '').replace('planetary ', '');
      message += `${emoji} ${shortName}: ${adj > 0 ? '+' : ''}${(adj * 100).toFixed(1)}%\n`;
    });
    message += '\n';
  }

  message += `<b>Version:</b> ${result.version}`;

  // Get Gemini summary
  try {
    const summary = await gemini.summarizeCalibration(result);
    if (summary) {
      message += `\n\n<b>Analysis:</b>\n<i>${summary}</i>`;
    }
  } catch (e) {}

  // Send to admin only (not broadcast)
  try {
    await telegram.sendToAdmin(message);
    logger.info('Calibration report sent');
  } catch (e) {
    logger.error('Failed to send calibration report', { error: e.message });
  }
}

// ============================================================
// MAIN EXECUTION
// ============================================================

/**
 * Main job execution
 */
async function execute() {
  if (isRunning) {
    logger.warn('Weekly calibration already running');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const result = await runCalibration();
    lastCalibrationResult = result;
    lastRunTime = new Date();

    const duration = Date.now() - startTime;
    logger.info('Weekly calibration complete', {
      durationMs: duration,
      success: result.success,
      version: result.version
    });

    // Send report if successful
    if (result.success) {
      await sendCalibrationReport(result);

      // Save calibration record
      try {
        await db.saveCalibrationRecord({
          calibration_date: lastRunTime,
          version: result.version,
          samples_used: result.samples,
          previous_weights: result.previousWeights,
          new_weights: result.newWeights,
          adjustments: result.adjustments,
          performance_metrics: result.overallMetrics
        });
      } catch (e) {
        logger.warn('Failed to save calibration record', { error: e.message });
      }
    }
  } catch (error) {
    logger.error('Weekly calibration failed', { error: error.message });
  } finally {
    isRunning = false;
  }
}

// ============================================================
// JOB CONTROL
// ============================================================

/**
 * Start the cron job
 */
function start() {
  if (cronJob) {
    logger.warn('Weekly calibration already started');
    return;
  }

  cronJob = cron.schedule(CRON_SCHEDULE, execute, {
    timezone: 'UTC'
  });

  logger.info('Weekly calibration started', { schedule: CRON_SCHEDULE });
}

/**
 * Stop the cron job
 */
function stop() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Weekly calibration stopped');
  }
}

/**
 * Run immediately
 */
async function runNow() {
  logger.info('Running weekly calibration manually');
  await execute();
}

/**
 * Get job status
 */
function getStatus() {
  return {
    running: isRunning,
    scheduled: cronJob !== null,
    schedule: CRON_SCHEDULE,
    lastRun: lastRunTime,
    lastResult: lastCalibrationResult ? {
      success: lastCalibrationResult.success,
      version: lastCalibrationResult.version,
      samples: lastCalibrationResult.samples
    } : null,
    config: CALIBRATION_CONFIG
  };
}

/**
 * Get last calibration result
 */
function getLastResult() {
  return lastCalibrationResult;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  start,
  stop,
  runNow,
  execute,
  getStatus,
  getLastResult,
  runCalibration,
  analyzeComponentPerformance,
  CALIBRATION_CONFIG
};
