/**
 * DAILY BRIEFING JOB
 * ==================
 * Runs at 00:00 UTC (5:30 AM IST)
 * Generates and sends the daily market briefing
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

// Market modules (optional)
let bybit, coingecko, marketRadar;
try {
  bybit = require('../modules/bybit');
  coingecko = require('../modules/coingecko');
  marketRadar = require('../modules/marketRadar');
} catch (e) {
  logger.debug('Some market modules not available');
}

// ============================================================
// CONFIGURATION
// ============================================================

// 00:00 UTC = 5:30 AM IST
const CRON_SCHEDULE = '0 0 * * *';

let cronJob = null;
let isRunning = false;
let lastRunTime = null;

// ============================================================
// BRIEFING GENERATION
// ============================================================

/**
 * Get current BTC price
 */
async function getCurrentPrice() {
  // Try Bybit
  if (bybit) {
    try {
      const ticker = await bybit.getTicker('BTCUSDT');
      if (ticker?.lastPrice) {
        return {
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.price24hPcnt || 0) * 100,
          source: 'bybit'
        };
      }
    } catch (e) {
      logger.debug('Bybit price failed', { error: e.message });
    }
  }

  // Try CoinGecko
  if (coingecko) {
    try {
      const data = await coingecko.getCoinPrice('bitcoin');
      if (data?.bitcoin) {
        return {
          price: data.bitcoin.usd,
          change24h: data.bitcoin.usd_24h_change || 0,
          source: 'coingecko'
        };
      }
    } catch (e) {
      logger.debug('CoinGecko price failed', { error: e.message });
    }
  }

  return null;
}

/**
 * Get market radar data
 */
async function getMarketRadarData() {
  if (!marketRadar) return null;

  try {
    const radar = await marketRadar.getFullRadar('BTCUSDT');
    return radar;
  } catch (e) {
    logger.debug('Market radar failed', { error: e.message });
    return null;
  }
}

/**
 * Get historical events for cycle analysis
 */
async function getHistoricalEvents() {
  try {
    const events = await db.getHistoricalEvents('BTC');
    if (events?.length > 0) return events;
  } catch (e) {
    logger.debug('DB events failed', { error: e.message });
  }

  // Fallback
  return [
    { event_date: '2024-04-20', event_type: 'halving', significance: 10 },
    { event_date: '2024-03-14', event_type: 'ath', significance: 8 },
    { event_date: '2022-11-09', event_type: 'crash', significance: 9 },
    { event_date: '2021-11-10', event_type: 'ath', significance: 9 }
  ];
}

/**
 * Generate the daily briefing
 */
async function generateBriefing() {
  const timestamp = new Date();
  logger.info('Generating daily briefing', { timestamp: timestamp.toISOString() });

  // Get current price
  const priceData = await getCurrentPrice();
  if (!priceData) {
    logger.error('Cannot generate briefing - no price data');
    return null;
  }

  const price = priceData.price;

  // Gann analysis
  const sq9 = gann.squareOf9(price);
  const wheel24 = gann.wheelOf24(price);
  const targets = gann.calculateTargets(price, 0.5, 5);
  const gannData = { sq9, wheel24, targets };

  // Cycle analysis
  const events = await getHistoricalEvents();
  const cycleAnalysis = gann.analyzeCycles(timestamp, events);

  // Planetary data
  const planets = planetary.getCurrentPlanets();
  const moon = planetary.getMoonInfo();
  const aspectData = planetary.getAspects();
  const majorEvents = planetary.scanMajorEvents(null, 7);
  const planetaryData = {
    planets,
    moon,
    aspects: aspectData.aspects,
    majorEvents: majorEvents.events
  };

  // Market radar
  const radarData = await getMarketRadarData();

  // Confluence score
  const confluenceData = await confluence.calculate(price, {
    gann: gannData,
    cycles: cycleAnalysis,
    planetary: planetaryData,
    market: radarData
  });

  // Build briefing data
  const briefingData = {
    price,
    change24h: priceData.change24h,
    gann: gannData,
    planetary: planetaryData,
    cycles: cycleAnalysis,
    marketRadar: radarData,
    confluence: confluenceData,
    timestamp
  };

  // Create snapshot
  try {
    await db.insertAnalysisSnapshot({
      symbol: 'BTCUSDT',
      price,
      snapshot_type: 'daily_briefing',
      confluence_score: confluenceData.score,
      bias: confluenceData.bias,
      gann_data: gannData,
      planetary_data: planetaryData,
      cycle_data: cycleAnalysis,
      market_data: radarData,
      weights_used: confluenceData.weights
    });
    logger.debug('Analysis snapshot saved');
  } catch (e) {
    logger.warn('Failed to save snapshot', { error: e.message });
  }

  return briefingData;
}

/**
 * Format and send the briefing
 */
async function sendBriefing(briefingData) {
  // Get Gemini narration (optional)
  let narration = null;
  try {
    narration = await gemini.narrateDailyBriefing(briefingData);
  } catch (e) {
    logger.debug('Gemini narration failed', { error: e.message });
  }

  // Format message
  let message = formatters.formatDailyBriefing(briefingData);

  // Add Gemini narration if available
  if (narration) {
    message += `\n<b>📝 Analysis:</b>\n<i>${formatters.escapeHtml(narration)}</i>`;
  }

  // Send to all users
  try {
    await telegram.broadcast(message);
    logger.info('Daily briefing sent successfully');
    return true;
  } catch (e) {
    logger.error('Failed to send briefing', { error: e.message });
    return false;
  }
}

/**
 * Main job execution
 */
async function execute() {
  if (isRunning) {
    logger.warn('Daily briefing already running, skipping');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    // Generate briefing
    const briefingData = await generateBriefing();

    if (!briefingData) {
      logger.error('Briefing generation failed');
      return;
    }

    // Send briefing
    await sendBriefing(briefingData);

    lastRunTime = new Date();
    const duration = Date.now() - startTime;
    logger.info('Daily briefing complete', { durationMs: duration });

    // Save to daily_briefings table
    try {
      await db.insertDailyBriefing({
        briefing_date: lastRunTime,
        symbol: 'BTCUSDT',
        price_at_briefing: briefingData.price,
        confluence_score: briefingData.confluence.score,
        bias: briefingData.confluence.bias,
        gann_summary: briefingData.gann,
        planetary_summary: briefingData.planetary,
        full_briefing: briefingData
      });
    } catch (e) {
      logger.warn('Failed to save briefing to DB', { error: e.message });
    }
  } catch (error) {
    logger.error('Daily briefing job failed', { error: error.message });
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
    logger.warn('Daily briefing job already started');
    return;
  }

  cronJob = cron.schedule(CRON_SCHEDULE, execute, {
    timezone: 'UTC'
  });

  logger.info('Daily briefing job started', { schedule: CRON_SCHEDULE });
}

/**
 * Stop the cron job
 */
function stop() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Daily briefing job stopped');
  }
}

/**
 * Run immediately (for testing)
 */
async function runNow() {
  logger.info('Running daily briefing manually');
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
  generateBriefing,
  sendBriefing
};
