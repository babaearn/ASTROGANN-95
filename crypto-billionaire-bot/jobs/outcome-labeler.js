/**
 * OUTCOME LABELER JOB
 * ===================
 * Labels prediction outcomes at 1h, 4h, and 24h intervals
 * Essential for the learning loop
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const db = require('../database/models');
const gemini = require('../modules/gemini');

// Market modules
let bybit, coingecko;
try {
  bybit = require('../modules/bybit');
  coingecko = require('../modules/coingecko');
} catch (e) {
  logger.debug('Some market modules not available');
}

// ============================================================
// CONFIGURATION
// ============================================================

// Run every hour
const CRON_SCHEDULE = '0 * * * *';

// Time windows for outcome labeling (in hours)
const OUTCOME_WINDOWS = [1, 4, 24];

// Hit thresholds
const HIT_THRESHOLDS = {
  bullish: 0.5,   // Price up by at least 0.5% = bullish hit
  bearish: -0.5,  // Price down by at least 0.5% = bearish hit
  neutral: 0.3    // Absolute change < 0.3% = neutral hit
};

let cronJob = null;
let isRunning = false;
let lastRunTime = null;
let labeledCount = { total: 0, hits: 0 };

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get current BTC price
 */
async function getCurrentPrice() {
  if (bybit) {
    try {
      const ticker = await bybit.getTicker('BTCUSDT');
      if (ticker?.lastPrice) {
        return parseFloat(ticker.lastPrice);
      }
    } catch (e) {}
  }

  if (coingecko) {
    try {
      const data = await coingecko.getCoinPrice('bitcoin');
      if (data?.bitcoin) {
        return data.bitcoin.usd;
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Get price at a specific timestamp (from history or estimate)
 */
async function getPriceAtTime(timestamp) {
  try {
    // Try to get from price history
    const history = await db.getPriceHistory('BTCUSDT', 1, timestamp);
    if (history?.length > 0) {
      return history[0].price;
    }
  } catch (e) {}

  // If we can't get historical price, return null
  return null;
}

/**
 * Calculate return percentage
 */
function calculateReturn(startPrice, endPrice) {
  if (!startPrice || !endPrice) return null;
  return ((endPrice - startPrice) / startPrice) * 100;
}

/**
 * Determine if prediction was a hit
 */
function isHit(bias, returnPct) {
  if (returnPct === null) return null;

  switch (bias) {
    case 'bullish':
      return returnPct >= HIT_THRESHOLDS.bullish;
    case 'bearish':
      return returnPct <= HIT_THRESHOLDS.bearish;
    case 'neutral':
      return Math.abs(returnPct) <= HIT_THRESHOLDS.neutral;
    default:
      return null;
  }
}

// ============================================================
// LABELING LOGIC
// ============================================================

/**
 * Get unlabeled snapshots for a specific time window
 */
async function getUnlabeledSnapshots(windowHours) {
  const now = new Date();
  const windowMs = windowHours * 60 * 60 * 1000;

  // Get snapshots that are at least windowHours old and not yet labeled for this window
  const cutoffTime = new Date(now.getTime() - windowMs);

  try {
    const snapshots = await db.getUnlabeledSnapshots('BTCUSDT', windowHours);
    return snapshots || [];
  } catch (e) {
    logger.error('Failed to get unlabeled snapshots', { error: e.message, windowHours });
    return [];
  }
}

/**
 * Label a single snapshot
 */
async function labelSnapshot(snapshot, windowHours) {
  const snapshotTime = new Date(snapshot.created_at);
  const labelTime = new Date(snapshotTime.getTime() + windowHours * 60 * 60 * 1000);

  // Get price at label time
  let labelPrice = null;
  if (labelTime <= new Date()) {
    labelPrice = await getPriceAtTime(labelTime);

    // If we can't get historical price, use current price for recent labels
    if (!labelPrice && (new Date() - labelTime) < 60 * 60 * 1000) {
      labelPrice = await getCurrentPrice();
    }
  }

  if (!labelPrice) {
    logger.debug('Cannot label - no price data', { snapshotId: snapshot.id, windowHours });
    return null;
  }

  // Calculate return
  const returnPct = calculateReturn(snapshot.price, labelPrice);
  const hit = isHit(snapshot.bias, returnPct);

  // Build outcome data
  const outcomeData = {
    snapshotId: snapshot.id,
    windowHours,
    startPrice: snapshot.price,
    endPrice: labelPrice,
    returnPct,
    bias: snapshot.bias,
    hit,
    labeledAt: new Date()
  };

  // Save to database
  try {
    await db.insertOutcomeLabel({
      snapshot_id: snapshot.id,
      symbol: snapshot.symbol || 'BTCUSDT',
      window_hours: windowHours,
      prediction_price: snapshot.price,
      actual_price: labelPrice,
      predicted_bias: snapshot.bias,
      actual_return: returnPct,
      [`hit_${windowHours}h`]: hit,
      confluence_score: snapshot.confluence_score
    });

    logger.debug('Snapshot labeled', {
      snapshotId: snapshot.id,
      windowHours,
      returnPct: returnPct?.toFixed(2),
      hit
    });

    return outcomeData;
  } catch (e) {
    logger.error('Failed to save outcome label', { error: e.message, snapshotId: snapshot.id });
    return null;
  }
}

/**
 * Label all pending snapshots for a time window
 */
async function labelWindow(windowHours) {
  const snapshots = await getUnlabeledSnapshots(windowHours);

  if (snapshots.length === 0) {
    logger.debug('No unlabeled snapshots', { windowHours });
    return { labeled: 0, hits: 0 };
  }

  logger.info(`Labeling ${snapshots.length} snapshots for ${windowHours}h window`);

  let labeled = 0;
  let hits = 0;

  for (const snapshot of snapshots) {
    const result = await labelSnapshot(snapshot, windowHours);
    if (result) {
      labeled++;
      if (result.hit) hits++;
    }
  }

  return { labeled, hits };
}

/**
 * Run the full labeling process
 */
async function runLabeling() {
  const results = {
    totalLabeled: 0,
    totalHits: 0,
    byWindow: {}
  };

  for (const windowHours of OUTCOME_WINDOWS) {
    const windowResult = await labelWindow(windowHours);
    results.byWindow[`${windowHours}h`] = windowResult;
    results.totalLabeled += windowResult.labeled;
    results.totalHits += windowResult.hits;
  }

  // Update running totals
  labeledCount.total += results.totalLabeled;
  labeledCount.hits += results.totalHits;

  return results;
}

// ============================================================
// ANALYSIS
// ============================================================

/**
 * Get recent performance metrics
 */
async function getPerformanceMetrics(days = 7) {
  try {
    const outcomes = await db.getOutcomeLabels('BTCUSDT', days);

    if (!outcomes || outcomes.length === 0) {
      return null;
    }

    // Calculate hit rates by window
    const metrics = {};

    for (const windowHours of OUTCOME_WINDOWS) {
      const windowOutcomes = outcomes.filter(o => o.window_hours === windowHours);
      const hits = windowOutcomes.filter(o => o[`hit_${windowHours}h`] === true).length;
      const total = windowOutcomes.length;

      metrics[`hitRate${windowHours}h`] = total > 0 ? hits / total : 0;
      metrics[`count${windowHours}h`] = total;
    }

    // Calculate overall hit rate
    const allHits = outcomes.filter(o =>
      o.hit_1h === true || o.hit_4h === true || o.hit_24h === true
    ).length;

    metrics.overallHitRate = outcomes.length > 0 ? allHits / outcomes.length : 0;
    metrics.totalOutcomes = outcomes.length;

    // Average return by bias
    const bullishOutcomes = outcomes.filter(o => o.predicted_bias === 'bullish');
    const bearishOutcomes = outcomes.filter(o => o.predicted_bias === 'bearish');

    metrics.avgReturnBullish = bullishOutcomes.length > 0
      ? bullishOutcomes.reduce((s, o) => s + (o.actual_return || 0), 0) / bullishOutcomes.length
      : 0;

    metrics.avgReturnBearish = bearishOutcomes.length > 0
      ? bearishOutcomes.reduce((s, o) => s + (o.actual_return || 0), 0) / bearishOutcomes.length
      : 0;

    return metrics;
  } catch (e) {
    logger.error('Failed to get performance metrics', { error: e.message });
    return null;
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
    logger.debug('Outcome labeler already running');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const results = await runLabeling();

    lastRunTime = new Date();
    const duration = Date.now() - startTime;

    if (results.totalLabeled > 0) {
      logger.info('Outcome labeling complete', {
        durationMs: duration,
        labeled: results.totalLabeled,
        hits: results.totalHits,
        hitRate: results.totalLabeled > 0
          ? ((results.totalHits / results.totalLabeled) * 100).toFixed(1) + '%'
          : 'N/A'
      });

      // Optionally get Gemini analysis of outcomes
      if (results.totalLabeled >= 5) {
        try {
          const metrics = await getPerformanceMetrics(1); // Last day
          if (metrics) {
            const analysis = await gemini.analyzeOutcome({
              recentLabels: results.totalLabeled,
              hitRate: results.totalHits / results.totalLabeled,
              metrics
            });
            if (analysis) {
              logger.info('Gemini outcome analysis', { analysis });
            }
          }
        } catch (e) {}
      }
    } else {
      logger.debug('No snapshots to label', { durationMs: duration });
    }
  } catch (error) {
    logger.error('Outcome labeler job failed', { error: error.message });
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
    logger.warn('Outcome labeler already started');
    return;
  }

  cronJob = cron.schedule(CRON_SCHEDULE, execute, {
    timezone: 'UTC'
  });

  logger.info('Outcome labeler started', { schedule: CRON_SCHEDULE });
}

/**
 * Stop the cron job
 */
function stop() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Outcome labeler stopped');
  }
}

/**
 * Run immediately
 */
async function runNow() {
  logger.info('Running outcome labeler manually');
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
    labeledCount,
    windows: OUTCOME_WINDOWS,
    thresholds: HIT_THRESHOLDS
  };
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
  runLabeling,
  labelSnapshot,
  getPerformanceMetrics,
  OUTCOME_WINDOWS,
  HIT_THRESHOLDS
};
