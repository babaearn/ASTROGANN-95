/**
 * WEEKLY WAR ROOM JOB
 * ===================
 * Runs Saturday at 12:30 UTC (6:00 PM IST)
 * Comprehensive weekly analysis and strategy session
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const telegram = require('../bot/telegram');
const formatters = require('../bot/formatters');
const gann = require('../modules/gann');
const planetary = require('../modules/planetary');
const confluence = require('../modules/confluence');
const gemini = require('../modules/gemini');
const db = require('../database/models');

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

// Saturday 12:30 UTC = 6:00 PM IST
const CRON_SCHEDULE = '30 12 * * 6';

let cronJob = null;
let isRunning = false;
let lastRunTime = null;

// ============================================================
// DATA GATHERING
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
 * Get week's price history
 */
async function getWeekPriceHistory() {
  try {
    const history = await db.getPriceHistory('BTCUSDT', 7);
    return history;
  } catch (e) {
    logger.debug('Price history not available', { error: e.message });
    return null;
  }
}

/**
 * Calculate week number
 */
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Get model performance metrics
 */
async function getPerformanceMetrics() {
  try {
    // Get outcomes from past week
    const outcomes = await db.getOutcomeLabels('BTCUSDT', 7);

    if (!outcomes || outcomes.length === 0) {
      return {
        hitRate24h: 0,
        avgReturn: 0,
        snapshotCount: 0
      };
    }

    // Calculate hit rates
    const hits24h = outcomes.filter(o => o.hit_24h === true).length;
    const total = outcomes.length;

    // Calculate average return
    const returns = outcomes
      .filter(o => o.actual_return_24h !== null)
      .map(o => o.actual_return_24h);

    const avgReturn = returns.length > 0
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0;

    return {
      hitRate24h: total > 0 ? hits24h / total : 0,
      avgReturn,
      snapshotCount: total
    };
  } catch (e) {
    logger.debug('Performance metrics not available', { error: e.message });
    return null;
  }
}

/**
 * Get historical events
 */
async function getHistoricalEvents() {
  try {
    const events = await db.getHistoricalEvents('BTC');
    if (events?.length > 0) return events;
  } catch (e) {}

  return [
    { event_date: '2024-04-20', event_type: 'halving', significance: 10 },
    { event_date: '2024-03-14', event_type: 'ath', significance: 8 },
    { event_date: '2022-11-09', event_type: 'crash', significance: 9 }
  ];
}

// ============================================================
// WAR ROOM GENERATION
// ============================================================

/**
 * Generate the weekly war room analysis
 */
async function generateWarRoom() {
  const timestamp = new Date();
  logger.info('Generating weekly war room', { timestamp: timestamp.toISOString() });

  // Current price
  const priceEnd = await getCurrentPrice();
  if (!priceEnd) {
    logger.error('Cannot generate war room - no price data');
    return null;
  }

  // Week number
  const weekNumber = getWeekNumber(timestamp);

  // Price history for week
  const priceHistory = await getWeekPriceHistory();
  const priceStart = priceHistory?.[0]?.price || priceEnd;
  const weeklyReturn = ((priceEnd - priceStart) / priceStart) * 100;

  // Gann analysis
  const sq9 = gann.squareOf9(priceEnd);
  const targets = gann.calculateTargets(priceEnd, 1, 10);
  const gannData = { sq9, targets };

  // Cycle analysis (extended lookahead)
  const events = await getHistoricalEvents();
  const cycleAnalysis = gann.analyzeCycles(timestamp, events);

  // Planetary analysis (2 week lookahead)
  const majorEvents = planetary.scanMajorEvents(null, 14);
  const moon = planetary.getMoonInfo();
  const aspects = planetary.getAspects();
  const planetaryData = {
    moon,
    aspects: aspects.aspects,
    majorEvents: majorEvents.events
  };

  // Performance metrics
  const performance = await getPerformanceMetrics();

  // Confluence for week ahead
  const confluenceData = await confluence.calculate(priceEnd, {
    gann: gannData,
    cycles: cycleAnalysis,
    planetary: planetaryData
  });

  // Upcoming week analysis
  const upcomingWeek = {
    bias: confluenceData.bias,
    keyDate: majorEvents.events?.[0]?.date || null,
    keyLevel: targets.keyLevels?.[0]?.level || null,
    cycleAlert: cycleAnalysis.upcomingCycles?.[0] || null
  };

  // Build war room data
  const warRoomData = {
    weekNumber,
    priceStart,
    priceEnd,
    weeklyReturn,
    gann: gannData,
    planetary: planetaryData,
    cycleAnalysis,
    performance,
    upcomingWeek,
    confluence: confluenceData,
    timestamp
  };

  return warRoomData;
}

/**
 * Format and send the war room
 */
async function sendWarRoom(warRoomData) {
  // Get Gemini narration
  let narration = null;
  try {
    narration = await gemini.narrateWeeklyWarRoom(warRoomData);
  } catch (e) {
    logger.debug('Gemini narration failed', { error: e.message });
  }

  // Format message
  let message = formatters.formatWeeklyWarRoom(warRoomData);

  // Add Gemini analysis
  if (narration) {
    message += `\n<b>🎖️ Strategic Analysis:</b>\n<i>${formatters.escapeHtml(narration)}</i>`;
  }

  // Send to all users
  try {
    await telegram.broadcast(message);
    logger.info('Weekly war room sent successfully');
    return true;
  } catch (e) {
    logger.error('Failed to send war room', { error: e.message });
    return false;
  }
}

/**
 * Main job execution
 */
async function execute() {
  if (isRunning) {
    logger.warn('Weekly war room already running, skipping');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    // Generate war room
    const warRoomData = await generateWarRoom();

    if (!warRoomData) {
      logger.error('War room generation failed');
      return;
    }

    // Send war room
    await sendWarRoom(warRoomData);

    lastRunTime = new Date();
    const duration = Date.now() - startTime;
    logger.info('Weekly war room complete', { durationMs: duration });

    // Save to weekly_war_rooms table
    try {
      await db.insertWeeklyWarRoom({
        week_start: new Date(lastRunTime.getTime() - 7 * 24 * 60 * 60 * 1000),
        week_end: lastRunTime,
        symbol: 'BTCUSDT',
        week_open: warRoomData.priceStart,
        week_close: warRoomData.priceEnd,
        week_return: warRoomData.weeklyReturn,
        cycle_summary: warRoomData.cycleAnalysis,
        planetary_summary: warRoomData.planetary,
        performance_metrics: warRoomData.performance,
        full_analysis: warRoomData
      });
    } catch (e) {
      logger.warn('Failed to save war room to DB', { error: e.message });
    }
  } catch (error) {
    logger.error('Weekly war room job failed', { error: error.message });
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
    logger.warn('Weekly war room job already started');
    return;
  }

  cronJob = cron.schedule(CRON_SCHEDULE, execute, {
    timezone: 'UTC'
  });

  logger.info('Weekly war room job started', { schedule: CRON_SCHEDULE });
}

/**
 * Stop the cron job
 */
function stop() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Weekly war room job stopped');
  }
}

/**
 * Run immediately
 */
async function runNow() {
  logger.info('Running weekly war room manually');
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
    lastRun: lastRunTime
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
  generateWarRoom,
  sendWarRoom
};
