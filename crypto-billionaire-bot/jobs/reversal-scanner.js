/**
 * REVERSAL SCANNER JOB
 * ====================
 * Scans ALL Bybit perpetual tickers for potential reversals
 * Alerts when high-confluence setups are detected
 *
 * Checks for:
 * - Gann Sq9 cardinal angles (0°, 90°, 180°, 270°)
 * - Price-Time Square alignments
 * - Planetary price level activations
 * - Multi-factor confluence
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const telegram = require('../bot/telegram');
const reversalScanner = require('../modules/reversalScanner');

// ============================================================
// CONFIGURATION
// ============================================================

// Run every 30 minutes
const CRON_SCHEDULE = '5,35 * * * *'; // At :05 and :35 past each hour

// Alert thresholds
const ALERT_CONFIG = {
  minReversalScore: 50,       // Minimum score to trigger alert
  maxAlertsPerScan: 3,        // Max coins to alert per scan
  cooldownMinutes: 120,       // Don't re-alert same coin within 2 hours
  priceTimeAlertThreshold: 98 // Alert if PT Square accuracy > 98%
};

let cronJob = null;
let isRunning = false;
let lastScanTime = null;
let alertedCoins = new Map(); // Track recently alerted coins

// ============================================================
// FORMATTERS
// ============================================================

/**
 * Format reversal alert message
 */
function formatReversalAlert(result) {
  const { symbol, baseCoin, price, change24h, reversalScore, gannCardinal, wheel24, priceTimeSquare, planetaryLevel } = result;

  let msg = `<b>🔮 REVERSAL ALERT: ${baseCoin}</b>\n`;
  msg += `<code>${new Date().toLocaleTimeString('en-US', { hour12: false })}</code>\n\n`;

  // Price
  const changeEmoji = change24h >= 0 ? '🟢' : '🔴';
  msg += `<b>💰 $${price.toLocaleString('en-US', { maximumFractionDigits: price < 1 ? 6 : 2 })}</b>`;
  msg += ` ${changeEmoji} ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%\n\n`;

  // Score
  const scoreBar = '█'.repeat(Math.floor(reversalScore.percentage / 10)) + '░'.repeat(10 - Math.floor(reversalScore.percentage / 10));
  msg += `<b>⚡ Score: ${reversalScore.percentage}%</b> [${scoreBar}]\n`;
  msg += `Rating: <b>${reversalScore.rating}</b>\n\n`;

  // Factors
  msg += `<b>📊 REVERSAL FACTORS:</b>\n`;
  reversalScore.factors.forEach(factor => {
    msg += `• ${factor}\n`;
  });
  msg += '\n';

  // Gann Details
  if (gannCardinal?.isNear) {
    const cardinalType = gannCardinal.significance === 'major' ? '🔴 MAJOR' : '🟡 Minor';
    msg += `<b>📐 Sq9:</b> ${cardinalType} cardinal at ${gannCardinal.cardinal}°\n`;
    msg += `   Distance: ${gannCardinal.distance.toFixed(1)}° away\n`;
  }

  // Wheel of 24
  if (wheel24?.nearBoundary) {
    msg += `<b>🎡 W24:</b> Quadrant ${wheel24.quadrant} boundary\n`;
  }

  // Price-Time Square
  if (priceTimeSquare?.hasAlignment) {
    msg += `<b>⏰ PT Square:</b> ${priceTimeSquare.daysSince}d from ${priceTimeSquare.event}\n`;
    msg += `   Target: $${priceTimeSquare.targetPrice.toFixed(0)} (${priceTimeSquare.accuracy.toFixed(1)}% match)\n`;
  }

  // Planetary
  if (planetaryLevel?.isActive) {
    msg += `<b>🪐 Planetary:</b> ${planetaryLevel.planet} at ${planetaryLevel.longitude.toFixed(0)}°\n`;
  }

  msg += `\n<b>⚠️ Potential reversal zone - watch for confirmation</b>`;

  return msg;
}

/**
 * Format Price-Time Square alert
 */
function formatPriceTimeAlert(alignment) {
  let msg = `<b>⏰ PRICE-TIME SQUARE ALERT</b>\n\n`;
  msg += `<b>${alignment.baseCoin}</b>: $${alignment.price.toLocaleString()}\n`;
  msg += `\n`;
  msg += `📅 <b>${alignment.daysSince} days</b> since ${alignment.event}\n`;
  msg += `🎯 Target: <b>$${alignment.targetPrice.toLocaleString()}</b>\n`;
  msg += `📊 Accuracy: <b>${alignment.accuracy}</b>\n`;
  msg += `\n`;
  msg += `<i>Price = Time convergence (×${alignment.multiplier})</i>\n`;
  msg += `<i>Gann's most powerful reversal signal</i>`;

  return msg;
}

/**
 * Format scan summary
 */
function formatScanSummary(scanResult) {
  let msg = `<b>🔍 REVERSAL SCAN COMPLETE</b>\n`;
  msg += `<code>${new Date().toLocaleTimeString('en-US', { hour12: false })}</code>\n\n`;

  msg += `Tickers scanned: ${scanResult.tickersScanned}\n`;
  msg += `Reversals found: ${scanResult.reversalsFound}\n`;
  msg += `Scan time: ${scanResult.scanDurationMs}ms\n\n`;

  if (scanResult.results.length === 0) {
    msg += `<i>No high-confluence reversals detected.</i>`;
    return msg;
  }

  msg += `<b>Top Opportunities:</b>\n`;
  scanResult.results.slice(0, 5).forEach((r, i) => {
    const emoji = r.reversalScore.rating === 'HIGH' ? '🔴' : r.reversalScore.rating === 'MEDIUM' ? '🟡' : '⚪';
    msg += `${i + 1}. ${emoji} <b>${r.baseCoin}</b> - ${r.reversalScore.percentage}%\n`;
    msg += `   $${r.price.toLocaleString('en-US', { maximumFractionDigits: r.price < 1 ? 4 : 2 })} | ${r.reversalScore.factors[0]}\n`;
  });

  return msg;
}

// ============================================================
// ALERT LOGIC
// ============================================================

/**
 * Check if we can alert for a coin (cooldown check)
 */
function canAlertCoin(symbol) {
  const lastAlert = alertedCoins.get(symbol);
  if (!lastAlert) return true;

  const cooldownMs = ALERT_CONFIG.cooldownMinutes * 60 * 1000;
  return (Date.now() - lastAlert) >= cooldownMs;
}

/**
 * Record that we alerted a coin
 */
function recordCoinAlert(symbol) {
  alertedCoins.set(symbol, Date.now());

  // Clean old entries
  const cutoff = Date.now() - ALERT_CONFIG.cooldownMinutes * 60 * 1000 * 2;
  for (const [sym, time] of alertedCoins.entries()) {
    if (time < cutoff) alertedCoins.delete(sym);
  }
}

// ============================================================
// MAIN SCANNER
// ============================================================

/**
 * Run the reversal scan
 */
async function execute() {
  if (isRunning) {
    logger.debug('Reversal scan already running');
    return;
  }

  isRunning = true;

  try {
    logger.info('Starting scheduled reversal scan');

    // 1. Run the main scan
    const scanResult = await reversalScanner.scanAllTickers({
      minScore: ALERT_CONFIG.minReversalScore,
      maxResults: 20
    });

    // 2. Filter for alertable results
    const alertableResults = scanResult.results
      .filter(r => r.reversalScore.rating !== 'LOW')
      .filter(r => canAlertCoin(r.symbol))
      .slice(0, ALERT_CONFIG.maxAlertsPerScan);

    // 3. Send alerts for high-score results
    for (const result of alertableResults) {
      if (result.reversalScore.percentage >= 60) { // Only alert HIGH scores
        const alertMsg = formatReversalAlert(result);
        await telegram.broadcast(alertMsg);
        recordCoinAlert(result.symbol);
        logger.info('Reversal alert sent', { symbol: result.symbol, score: result.reversalScore.percentage });
      }
    }

    // 4. Check for Price-Time Square alignments (very rare, always alert)
    const ptAlignments = await reversalScanner.scanPriceTimeAlignments();
    for (const alignment of ptAlignments.alignments) {
      if (parseFloat(alignment.accuracy) >= ALERT_CONFIG.priceTimeAlertThreshold) {
        if (canAlertCoin(alignment.symbol + '_PT')) {
          const ptMsg = formatPriceTimeAlert(alignment);
          await telegram.broadcast(ptMsg);
          recordCoinAlert(alignment.symbol + '_PT');
          logger.info('Price-Time Square alert sent', { symbol: alignment.symbol });
        }
      }
    }

    lastScanTime = new Date();
    logger.info('Reversal scan complete', {
      reversalsFound: scanResult.reversalsFound,
      alertsSent: alertableResults.filter(r => r.reversalScore.percentage >= 60).length
    });

    return scanResult;

  } catch (error) {
    logger.error('Reversal scanner error', { error: error.message });
  } finally {
    isRunning = false;
  }
}

/**
 * Run scan and return summary (for manual trigger)
 */
async function runWithSummary() {
  try {
    const scanResult = await reversalScanner.scanAllTickers({
      minScore: 30,
      maxResults: 10
    });

    const summary = formatScanSummary(scanResult);
    return { scanResult, summary };
  } catch (error) {
    logger.error('Reversal scan with summary failed', { error: error.message });
    throw error;
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
    logger.warn('Reversal scanner already started');
    return;
  }

  cronJob = cron.schedule(CRON_SCHEDULE, execute, {
    timezone: 'UTC'
  });

  logger.info('Reversal scanner started', { schedule: CRON_SCHEDULE });
}

/**
 * Stop the cron job
 */
function stop() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Reversal scanner stopped');
  }
}

/**
 * Run immediately
 */
async function runNow() {
  logger.info('Running reversal scan manually');
  return execute();
}

/**
 * Get job status
 */
function getStatus() {
  return {
    running: isRunning,
    scheduled: cronJob !== null,
    schedule: CRON_SCHEDULE,
    lastScan: lastScanTime,
    alertedCoinsCount: alertedCoins.size,
    config: ALERT_CONFIG
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
  runWithSummary,
  getStatus,
  formatReversalAlert,
  formatScanSummary,
  formatPriceTimeAlert,
  ALERT_CONFIG
};
