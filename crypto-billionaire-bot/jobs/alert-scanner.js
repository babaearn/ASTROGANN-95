/**
 * ALERT SCANNER JOB
 * =================
 * Continuous scanner for high-confluence conditions
 * Only alerts when multiple factors align (no spam)
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

// Run every 15 minutes
const CRON_SCHEDULE = '*/15 * * * *';

// Alert thresholds
const ALERT_CONFIG = {
  minConfluence: 0.75,           // Minimum confluence score to alert
  levelProximityPct: 0.5,        // Alert when within 0.5% of key level
  cooldownMinutes: 60,           // Minimum time between same-type alerts
  maxAlertsPerDay: 6             // Maximum alerts per day
};

let cronJob = null;
let isRunning = false;
let lastScanTime = null;
let alertHistory = []; // Track recent alerts

// ============================================================
// ALERT TYPES
// ============================================================

const ALERT_TYPES = {
  CONFLUENCE_SPIKE: 'confluence_spike',
  LEVEL_TOUCH: 'level_touch',
  PLANETARY_EVENT: 'planetary_event',
  CYCLE_CONVERGENCE: 'cycle_convergence'
};

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
 * Check if we can send this type of alert (cooldown)
 */
function canSendAlert(alertType) {
  const now = Date.now();
  const cooldownMs = ALERT_CONFIG.cooldownMinutes * 60 * 1000;

  // Check cooldown for this alert type
  const recentSameType = alertHistory.find(a =>
    a.type === alertType &&
    (now - a.timestamp) < cooldownMs
  );

  if (recentSameType) {
    logger.debug('Alert on cooldown', { alertType });
    return false;
  }

  // Check max alerts per day
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayAlerts = alertHistory.filter(a => a.timestamp > dayStart.getTime());

  if (todayAlerts.length >= ALERT_CONFIG.maxAlertsPerDay) {
    logger.debug('Max daily alerts reached', { count: todayAlerts.length });
    return false;
  }

  return true;
}

/**
 * Record that an alert was sent
 */
function recordAlert(alertType) {
  alertHistory.push({
    type: alertType,
    timestamp: Date.now()
  });

  // Clean old history (keep last 24 hours)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  alertHistory = alertHistory.filter(a => a.timestamp > cutoff);
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
// SCANNER LOGIC
// ============================================================

/**
 * Check for high confluence conditions
 */
async function checkConfluence(price, gannData, planetaryData, cycleData, marketData) {
  const confluenceResult = await confluence.calculate(price, {
    gann: gannData,
    cycles: cycleData,
    planetary: planetaryData,
    market: marketData
  });

  if (confluenceResult.score >= ALERT_CONFIG.minConfluence) {
    return {
      type: ALERT_TYPES.CONFLUENCE_SPIKE,
      trigger: `Confluence at ${(confluenceResult.score * 100).toFixed(0)}%`,
      data: confluenceResult
    };
  }

  return null;
}

/**
 * Check for level proximity
 */
function checkLevelProximity(price, gannData) {
  if (!gannData?.targets) return null;

  const { closestSupport, closestResistance, keyLevels } = gannData.targets;

  // Check supports
  if (closestSupport) {
    const dist = Math.abs(closestSupport.percentFromPrice || 0);
    if (dist <= ALERT_CONFIG.levelProximityPct) {
      return {
        type: ALERT_TYPES.LEVEL_TOUCH,
        trigger: `Price near support at ${formatters.formatPrice(closestSupport.level)}`,
        level: closestSupport.level,
        direction: 'support'
      };
    }
  }

  // Check resistances
  if (closestResistance) {
    const dist = Math.abs(closestResistance.percentFromPrice || 0);
    if (dist <= ALERT_CONFIG.levelProximityPct) {
      return {
        type: ALERT_TYPES.LEVEL_TOUCH,
        trigger: `Price near resistance at ${formatters.formatPrice(closestResistance.level)}`,
        level: closestResistance.level,
        direction: 'resistance'
      };
    }
  }

  // Check convergence levels (multiple sources)
  const strongLevels = (keyLevels || []).filter(l => l.convergence >= 3);
  for (const level of strongLevels) {
    const dist = Math.abs((level.level - price) / price * 100);
    if (dist <= ALERT_CONFIG.levelProximityPct) {
      return {
        type: ALERT_TYPES.LEVEL_TOUCH,
        trigger: `Price at ${level.convergence}x convergence level ${formatters.formatPrice(level.level)}`,
        level: level.level,
        direction: level.direction,
        convergence: level.convergence
      };
    }
  }

  return null;
}

/**
 * Check for imminent planetary events
 */
function checkPlanetaryEvents(planetaryData) {
  if (!planetaryData?.majorEvents) return null;

  const now = new Date();

  // Find events within next 4 hours
  const imminentEvents = planetaryData.majorEvents.filter(event => {
    if (!event.date) return false;
    const eventDate = new Date(event.date);
    const hoursUntil = (eventDate - now) / (1000 * 60 * 60);
    return hoursUntil >= 0 && hoursUntil <= 4;
  });

  if (imminentEvents.length > 0) {
    const event = imminentEvents[0];
    return {
      type: ALERT_TYPES.PLANETARY_EVENT,
      trigger: `Upcoming: ${event.type} - ${event.description || 'Planetary event'}`,
      event
    };
  }

  return null;
}

/**
 * Check for cycle convergence
 */
function checkCycleConvergence(cycleData) {
  if (!cycleData) return null;

  // High convergence with major hits
  if (cycleData.convergenceScore >= 0.8 && cycleData.majorHits?.length >= 2) {
    return {
      type: ALERT_TYPES.CYCLE_CONVERGENCE,
      trigger: `${cycleData.majorHits.length} major cycles converging (${(cycleData.convergenceScore * 100).toFixed(0)}%)`,
      cycles: cycleData.majorHits.slice(0, 3)
    };
  }

  return null;
}

// ============================================================
// MAIN SCANNER
// ============================================================

/**
 * Run the scanner
 */
async function scan() {
  const timestamp = new Date();
  logger.debug('Running alert scan', { timestamp: timestamp.toISOString() });

  // Get price
  const price = await getCurrentPrice();
  if (!price) {
    logger.debug('Scan skipped - no price data');
    return [];
  }

  // Gann analysis
  const sq9 = gann.squareOf9(price);
  const targets = gann.calculateTargets(price, 0.5, 5);
  const gannData = { sq9, targets };

  // Cycle analysis
  const events = await getHistoricalEvents();
  const cycleData = gann.analyzeCycles(timestamp, events);

  // Planetary analysis
  const moon = planetary.getMoonInfo();
  const aspects = planetary.getAspects();
  const majorEvents = planetary.scanMajorEvents(null, 1); // 1 day lookahead
  const planetaryData = {
    moon,
    aspects: aspects.aspects,
    majorEvents: majorEvents.events
  };

  // Market radar (optional)
  let marketData = null;
  if (marketRadar) {
    try {
      marketData = await marketRadar.getFullRadar('BTCUSDT');
    } catch (e) {}
  }

  // Run all checks
  const alerts = [];

  // Check confluence
  const confluenceAlert = await checkConfluence(price, gannData, planetaryData, cycleData, marketData);
  if (confluenceAlert && canSendAlert(confluenceAlert.type)) {
    alerts.push({ ...confluenceAlert, price, timestamp });
  }

  // Check level proximity
  const levelAlert = checkLevelProximity(price, gannData);
  if (levelAlert && canSendAlert(levelAlert.type)) {
    alerts.push({ ...levelAlert, price, timestamp });
  }

  // Check planetary events
  const planetaryAlert = checkPlanetaryEvents(planetaryData);
  if (planetaryAlert && canSendAlert(planetaryAlert.type)) {
    alerts.push({ ...planetaryAlert, price, timestamp });
  }

  // Check cycle convergence
  const cycleAlert = checkCycleConvergence(cycleData);
  if (cycleAlert && canSendAlert(cycleAlert.type)) {
    alerts.push({ ...cycleAlert, price, timestamp });
  }

  return alerts;
}

/**
 * Send an alert
 */
async function sendAlert(alert) {
  // Get Gemini context
  let context = null;
  try {
    context = await gemini.narrateAlert(alert);
  } catch (e) {
    logger.debug('Gemini alert context failed', { error: e.message });
  }

  // Get confluence for the alert
  let confluenceData = alert.data;
  if (!confluenceData) {
    try {
      confluenceData = await confluence.calculate(alert.price);
    } catch (e) {}
  }

  // Format message
  let message = formatters.formatAlert({
    type: alert.type,
    price: alert.price,
    confluence: confluenceData,
    trigger: alert.trigger,
    timestamp: alert.timestamp
  });

  // Add context
  if (context) {
    message += `\n<i>${formatters.escapeHtml(context)}</i>`;
  }

  // Send
  try {
    await telegram.broadcast(message);
    recordAlert(alert.type);
    logger.info('Alert sent', { type: alert.type, trigger: alert.trigger });

    // Create snapshot
    try {
      await db.insertAnalysisSnapshot({
        symbol: 'BTCUSDT',
        price: alert.price,
        snapshot_type: 'alert',
        confluence_score: confluenceData?.score,
        bias: confluenceData?.bias,
        alert_type: alert.type,
        alert_trigger: alert.trigger
      });
    } catch (e) {}

    return true;
  } catch (e) {
    logger.error('Failed to send alert', { error: e.message });
    return false;
  }
}

/**
 * Main job execution
 */
async function execute() {
  if (isRunning) {
    logger.debug('Alert scan already running');
    return;
  }

  isRunning = true;

  try {
    const alerts = await scan();

    // Send highest priority alert only (avoid spam)
    if (alerts.length > 0) {
      // Priority: confluence > level > cycle > planetary
      const priorityOrder = [
        ALERT_TYPES.CONFLUENCE_SPIKE,
        ALERT_TYPES.LEVEL_TOUCH,
        ALERT_TYPES.CYCLE_CONVERGENCE,
        ALERT_TYPES.PLANETARY_EVENT
      ];

      alerts.sort((a, b) => {
        return priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type);
      });

      await sendAlert(alerts[0]);
    }

    lastScanTime = new Date();
  } catch (error) {
    logger.error('Alert scanner error', { error: error.message });
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
    logger.warn('Alert scanner already started');
    return;
  }

  cronJob = cron.schedule(CRON_SCHEDULE, execute, {
    timezone: 'UTC'
  });

  logger.info('Alert scanner started', { schedule: CRON_SCHEDULE });
}

/**
 * Stop the cron job
 */
function stop() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Alert scanner stopped');
  }
}

/**
 * Run immediately
 */
async function runNow() {
  logger.info('Running alert scan manually');
  await execute();
}

/**
 * Get job status
 */
function getStatus() {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayAlerts = alertHistory.filter(a => a.timestamp > dayStart.getTime());

  return {
    running: isRunning,
    scheduled: cronJob !== null,
    schedule: CRON_SCHEDULE,
    lastScan: lastScanTime,
    alertsToday: todayAlerts.length,
    maxAlertsPerDay: ALERT_CONFIG.maxAlertsPerDay,
    config: ALERT_CONFIG
  };
}

/**
 * Clear alert history (for testing)
 */
function clearHistory() {
  alertHistory = [];
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
  scan,
  sendAlert,
  clearHistory,
  ALERT_TYPES,
  ALERT_CONFIG
};
