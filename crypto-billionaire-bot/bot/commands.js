/**
 * TELEGRAM COMMAND HANDLERS
 * =========================
 * All bot command implementations
 */

const logger = require('../utils/logger');
const formatters = require('./formatters');
const gann = require('../modules/gann');
const planetary = require('../modules/planetary');
const confluence = require('../modules/confluence');
const db = require('../database/models');

// Market data modules (may not be available)
let bybit, coingecko, marketRadar, coinAnalysis, planetaryPrice, reversalScanner, quantEngine;
try {
  bybit = require('../modules/bybit');
  coingecko = require('../modules/coingecko');
  marketRadar = require('../modules/marketRadar');
  coinAnalysis = require('../modules/coinAnalysis');
  planetaryPrice = require('../modules/planetaryPrice');
  reversalScanner = require('../modules/reversalScanner');
  quantEngine = require('../modules/quantEngine');
} catch (e) {
  logger.warn('Some market modules not available', { error: e.message });
}

// In-memory model preferences (fallback when DB unavailable)
const userModelPreferences = new Map();

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get current BTC price from available sources
 */
async function getCurrentPrice() {
  // Try Bybit first
  if (bybit) {
    try {
      const ticker = await bybit.bybitClient.getTickerBySymbol('BTCUSDT', 'linear');
      if (ticker?.lastPrice) {
        return {
          price: parseFloat(ticker.lastPrice),
          source: 'bybit',
          change24h: parseFloat(ticker.price24hPcnt || 0)
        };
      }
    } catch (e) {
      logger.debug('Bybit price fetch failed', { error: e.message });
    }
  }

  // Try CoinGecko
  if (coingecko) {
    try {
      const data = await coingecko.coinGeckoClient.fetchTopCoins({ per_page: 1, order: 'market_cap_desc' });
      const btc = data.coins?.find(c => c.symbol === 'BTC');
      if (btc) {
        return {
          price: btc.price,
          source: 'coingecko',
          change24h: btc.price_change_percentage_24h || 0
        };
      }
    } catch (e) {
      logger.debug('CoinGecko price fetch failed', { error: e.message });
    }
  }

  // Return null if no price available
  return null;
}

/**
 * Get historical events for cycle analysis
 */
async function getHistoricalEvents() {
  try {
    const events = await db.getHistoricalEvents('BTC');
    if (events && events.length > 0) {
      return events;
    }
  } catch (e) {
    logger.debug('DB historical events fetch failed', { error: e.message });
  }

  // Fallback to hardcoded events
  return [
    { event_date: '2024-04-20', event_type: 'halving', description: 'BTC Halving 2024', significance: 10 },
    { event_date: '2024-03-14', event_type: 'ath', description: 'Post-ETF ATH', significance: 8 },
    { event_date: '2022-11-09', event_type: 'crash', description: 'FTX Collapse', significance: 9 },
    { event_date: '2021-11-10', event_type: 'ath', description: '2021 Cycle ATH', significance: 9 },
    { event_date: '2020-05-11', event_type: 'halving', description: 'Third Halving', significance: 10 }
  ];
}

// ============================================================
// MODEL PREFERENCE HELPERS
// ============================================================

/**
 * Get user's analysis model preference (1 = Classic, 2 = Quant)
 */
async function getUserModel(chatId) {
  // Try database first
  try {
    const settings = await db.getUserSettings(chatId);
    if (settings?.alert_preferences?.analysisModel) {
      return settings.alert_preferences.analysisModel;
    }
  } catch (e) {
    logger.debug('Failed to get model preference from DB', { error: e.message });
  }

  // Fallback to in-memory
  return userModelPreferences.get(chatId) || 1; // Default: Model 1 (Classic)
}

/**
 * Set user's analysis model preference
 */
async function setUserModel(chatId, model) {
  // Store in memory
  userModelPreferences.set(chatId, model);

  // Try to persist to database
  try {
    const settings = await db.getUserSettings(chatId);
    const alertPrefs = settings?.alert_preferences || {};
    alertPrefs.analysisModel = model;

    await db.upsertUserSettings(chatId, {
      ...settings,
      alertPreferences: alertPrefs
    });
  } catch (e) {
    logger.debug('Failed to save model preference to DB', { error: e.message });
  }
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

/**
 * Handle /start command
 */
async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const username = msg.from?.username || msg.from?.first_name || 'User';

  try {
    // Save user settings
    await db.upsertUserSettings(chatId, {
      username,
      displayTimezone: 'Asia/Kolkata',
      preferredSymbols: ['BTCUSDT'],
      alertPreferences: { daily_briefing: true, level_alerts: true },
      isActive: true
    });
  } catch (e) {
    logger.debug('Failed to save user settings', { error: e.message });
  }

  const welcomeMsg = `<b>Welcome to Crypto Billionaire Bot!</b>

Hello ${formatters.escapeHtml(username)}! 👋

I provide institutional-grade crypto intelligence using:
• W.D. Gann mathematical analysis
• Planetary timing & cycles
• Market breadth analysis
• Confluence scoring

<b>Daily Briefing:</b> 5:30 AM IST
<b>Weekly War Room:</b> Saturday 6:00 PM IST

Type /help for available commands.

<i>This is for analysis only. Not financial advice.</i>`;

  await bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'HTML' });
}

/**
 * Handle /help command
 */
async function handleHelp(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, formatters.formatHelp(), { parse_mode: 'HTML' });
}

/**
 * Handle /status command
 */
async function handleStatus(bot, msg) {
  const chatId = msg.chat.id;

  try {
    const priceData = await getCurrentPrice();

    if (!priceData) {
      await bot.sendMessage(chatId, '⚠️ Unable to fetch current price. Please try again later.');
      return;
    }

    // Get confluence
    let confluenceData = null;
    try {
      confluenceData = await confluence.calculate(priceData.price);
    } catch (e) {
      logger.debug('Confluence calculation failed', { error: e.message });
    }

    // Calculate next briefing time (5:30 AM IST = 00:00 UTC)
    const now = new Date();
    const nextBriefing = new Date(now);
    nextBriefing.setUTCHours(0, 0, 0, 0);
    if (now.getUTCHours() >= 0) {
      nextBriefing.setDate(nextBriefing.getDate() + 1);
    }

    const statusMsg = formatters.formatStatus({
      price: priceData.price,
      change24h: priceData.change24h,
      confluence: confluenceData,
      nextBriefing,
      botUptime: process.uptime(),
      timestamp: new Date()
    });

    await bot.sendMessage(chatId, statusMsg, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Status command error', { error: error.message, chatId });
    await bot.sendMessage(chatId, formatters.formatError(error, '/status'), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /gann command - Complete Gann + Planetary analysis for any coin
 * Usage: /gann XRP or /gann XRP 1D or /gann BTC 4H
 * Dispatches to Model 1 (Classic) or Model 2 (Quant) based on user preference
 */
async function handleGann(bot, msg) {
  const chatId = msg.chat.id;

  // Parse command: /gann [SYMBOL] [TIMEFRAME]
  const text = msg.text || '';
  const parts = text.split(/\s+/);
  const symbolInput = parts[1];
  const timeframeInput = parts[2];

  // Default to BTC if no symbol provided
  const symbol = symbolInput ? symbolInput.toUpperCase() : 'BTC';
  const bybitSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;

  // Supported timeframes
  const TIMEFRAMES = {
    '5M': '5', '15M': '15', '30M': '30',
    '1H': '60', '2H': '120', '4H': '240',
    '1D': 'D', 'D': 'D', 'DAILY': 'D',
    '1W': 'W', 'W': 'W', 'WEEKLY': 'W'
  };

  const timeframe = timeframeInput ? (TIMEFRAMES[timeframeInput.toUpperCase()] || '240') : '240'; // Default 4H
  const tfDisplay = Object.entries(TIMEFRAMES).find(([k, v]) => v === timeframe)?.[0] || '4H';

  // Get user's model preference
  const userModel = await getUserModel(chatId);

  // Show usage if just /gann
  if (!symbolInput) {
    const modelName = userModel === 1 ? 'Classic' : 'Quant';
    await bot.sendMessage(chatId,
      `<b>📐 GANN ANALYSIS (Model ${userModel}: ${modelName})</b>\n\n` +
      `Usage: <code>/gann SYMBOL [TIMEFRAME]</code>\n\n` +
      `<b>Examples:</b>\n` +
      `• /gann XRP\n` +
      `• /gann BTC 1D\n` +
      `• /gann SOL 4H\n` +
      `• /gann ETH 1W\n\n` +
      `<b>Timeframes:</b>\n` +
      `5M, 15M, 30M, 1H, 2H, 4H, 1D, 1W\n\n` +
      `<i>Default: 4H timeframe | /model to switch models</i>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Route to appropriate model handler
  if (userModel === 2 && quantEngine) {
    return handleGannModel2(bot, msg, chatId, symbol, bybitSymbol, timeframe, tfDisplay);
  }

  // Model 1 (Classic) - Continue with existing logic
  const loadingMsg = await bot.sendMessage(chatId,
    `🔄 Analyzing <b>${symbol}</b> on <b>${tfDisplay}</b>...\n\n<i>Model 1: Classic Gann + Planetary</i>`,
    { parse_mode: 'HTML' }
  );

  try {
    if (!coinAnalysis || !planetaryPrice) {
      throw new Error('Analysis modules not available');
    }

    // Get full coin analysis with specified timeframe
    const analysis = await coinAnalysis.analyzeCoin(symbol, { interval: timeframe });
    const price = analysis.price.current;
    const displayName = analysis.displayName;

    // Delete loading message
    try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}

    // ═══════════════════════════════════════════════════════════════
    // MESSAGE 1: GANN SQUARE OF 9 + WHEEL OF 24
    // ═══════════════════════════════════════════════════════════════
    let gannMsg = `<b>📐 ${displayName} GANN ANALYSIS</b>\n`;
    gannMsg += `<code>${formatters.formatTime(new Date())} | ${tfDisplay}</code>\n\n`;

    // Price
    const changeEmoji = analysis.price.change24h >= 0 ? '🟢' : '🔴';
    gannMsg += `<b>💰 ${formatters.formatCoinPrice(price, displayName)}</b> ${changeEmoji} ${formatters.formatPercent(analysis.price.change24h)}\n\n`;

    // Square of 9
    gannMsg += `<b>🔢 SQUARE OF 9</b>\n`;
    gannMsg += `Degree: <b>${analysis.gann.squareOf9.degree?.toFixed(1)}°</b>\n`;

    // Sq9 Flags
    const flags = analysis.gann.squareOf9.flags || {};
    if (flags.nearCardinal) gannMsg += `⚠️ <b>NEAR CARDINAL</b> - Major reversal zone\n`;
    if (flags.nearTop) gannMsg += `⚠️ <b>NEAR CYCLE TOP</b>\n`;
    if (flags.nearBottom) gannMsg += `⚠️ <b>NEAR CYCLE BOTTOM</b>\n`;

    // Sq9 Levels
    gannMsg += `\n<b>↓ Sq9 Support:</b>\n`;
    analysis.gann.squareOf9.supports.slice(0, 3).forEach(s => {
      gannMsg += `  ${formatters.formatCoinPrice(s, displayName)}\n`;
    });

    gannMsg += `\n<b>↑ Sq9 Resistance:</b>\n`;
    analysis.gann.squareOf9.resistances.slice(0, 3).forEach(r => {
      gannMsg += `  ${formatters.formatCoinPrice(r, displayName)}\n`;
    });

    // Wheel of 24
    gannMsg += `\n<b>🎡 WHEEL OF 24</b>\n`;
    gannMsg += `Degree: <b>${analysis.gann.wheelOf24.degree?.toFixed(1)}°</b>\n`;
    gannMsg += `Quadrant: <b>Q${analysis.gann.wheelOf24.quadrant}</b> - ${analysis.gann.wheelOf24.description || ''}\n`;

    if (analysis.gann.wheelOf24.nearCardinal) {
      gannMsg += `⚠️ <b>NEAR QUADRANT BOUNDARY</b> - Phase change zone\n`;
    }

    await bot.sendMessage(chatId, gannMsg, { parse_mode: 'HTML' });

    // ═══════════════════════════════════════════════════════════════
    // MESSAGE 2: PLANETARY PRICE LEVELS (Billionaire Format)
    // ═══════════════════════════════════════════════════════════════
    if (analysis.planetaryPrice) {
      let ppMsg = `<b>🔮 ${displayName} PLANETARY PRICE LEVELS</b>\n`;
      ppMsg += `<i>Billionaire-Level Planetary-Price Linkage</i>\n\n`;

      const pp = analysis.planetaryPrice;

      // Planetary Price Zones
      ppMsg += `<b>🪐 PLANETARY PRICE ZONES</b>\n`;

      // Active zones (near current price)
      if (pp.activeZones && pp.activeZones.length > 0) {
        ppMsg += `⚠️ <b>ACTIVE NOW:</b>\n`;
        pp.activeZones.slice(0, 2).forEach(z => {
          ppMsg += `  ${z.symbol || '🪐'} ${z.planet}: ${formatters.formatCoinPrice(z.level, displayName)} (${z.sign || ''})\n`;
        });
        ppMsg += `  ← Price is HERE\n\n`;
      }

      // Planetary Resistance
      if (pp.levels) {
        const resistLevels = pp.levels.filter(l => l.level > price).slice(0, 3);
        if (resistLevels.length > 0) {
          ppMsg += `<b>↑ Planetary Resistance:</b>\n`;
          resistLevels.forEach(l => {
            ppMsg += `  ${l.symbol || '🪐'} ${l.planet} (${l.longitude?.toFixed(0)}°): ${formatters.formatCoinPrice(l.level, displayName)}\n`;
          });
          ppMsg += `\n`;
        }

        // Planetary Support
        const supportLevels = pp.levels.filter(l => l.level < price).slice(0, 3);
        if (supportLevels.length > 0) {
          ppMsg += `<b>↓ Planetary Support:</b>\n`;
          supportLevels.forEach(l => {
            ppMsg += `  ${l.symbol || '🪐'} ${l.planet} (${l.longitude?.toFixed(0)}°): ${formatters.formatCoinPrice(l.level, displayName)}\n`;
          });
          ppMsg += `\n`;
        }
      }

      // Price-Time Square
      if (pp.priceTimeSquare) {
        ppMsg += `<b>⏰ PRICE-TIME SQUARE</b>\n`;
        if (pp.priceTimeSquare.hasAlignment) {
          ppMsg += `🎯 <b>ACTIVE SQUARE:</b>\n`;
          ppMsg += `  ${pp.priceTimeSquare.daysSince} days from ${pp.priceTimeSquare.event || 'Major Event'}\n`;
          ppMsg += `  Target: ${formatters.formatCoinPrice(pp.priceTimeSquare.targetPrice, displayName)} | Accuracy: ${pp.priceTimeSquare.accuracy?.toFixed(1)}%\n`;
          ppMsg += `  <i>Price = Time convergence → Major reversal zone</i>\n\n`;
        } else {
          ppMsg += `  No active alignment\n`;
          ppMsg += `  Nearest: ${pp.priceTimeSquare.daysSince || 'N/A'}d → $${pp.priceTimeSquare.closestTarget?.toFixed(0) || 'N/A'}\n\n`;
        }
      }

      // Lunar Cycle
      if (pp.lunarCycle) {
        ppMsg += `<b>🌙 LUNAR TRADING CYCLE</b>\n`;
        const moonEmoji = pp.lunarCycle.illumination > 90 ? '🌕' :
                         pp.lunarCycle.illumination > 60 ? '🌔' :
                         pp.lunarCycle.illumination > 40 ? '🌓' :
                         pp.lunarCycle.illumination > 10 ? '🌒' : '🌑';
        ppMsg += `Phase: ${moonEmoji} ${pp.lunarCycle.phase} (${pp.lunarCycle.illumination?.toFixed(0)}%)\n`;

        const zoneEmoji = pp.lunarCycle.tradingZone === 'ACCUMULATION' ? '🟢' :
                         pp.lunarCycle.tradingZone === 'DISTRIBUTION' ? '🔴' : '🟡';
        ppMsg += `Zone: ${zoneEmoji} <b>${pp.lunarCycle.tradingZone}</b>\n`;
        ppMsg += `<i>${pp.lunarCycle.tradingAdvice || ''}</i>\n\n`;
      }

      // Planetary Reversal Dates
      if (pp.reversalDates && pp.reversalDates.length > 0) {
        ppMsg += `<b>📅 PLANETARY REVERSAL DATES</b>\n`;
        pp.reversalDates.slice(0, 3).forEach(d => {
          const urgency = d.daysUntil <= 3 ? '🔴' : d.daysUntil <= 7 ? '🟠' : '🟡';
          ppMsg += `${urgency} ${d.date} (${d.daysUntil}d): ${d.event}\n`;
        });
        ppMsg += `\n`;
      }

      // Overall Planetary Bias
      if (analysis.planetary && analysis.planetary.bias) {
        const bias = analysis.planetary.bias;
        const biasEmoji = bias.bias === 'bullish' ? '🟢' : bias.bias === 'bearish' ? '🔴' : '⚪';
        ppMsg += `<b>Overall Planetary Bias:</b> ${biasEmoji} <b>${(bias.bias || 'NEUTRAL').toUpperCase()}</b> (${bias.score || 50}%)`;
      }

      await bot.sendMessage(chatId, ppMsg, { parse_mode: 'HTML' });
    }

    // ═══════════════════════════════════════════════════════════════
    // MESSAGE 3: KEY REVERSAL ZONES + TRADING SCENARIOS
    // ═══════════════════════════════════════════════════════════════
    if (analysis.reversalZones && analysis.reversalZones.length > 0) {
      let zoneMsg = `<b>🎯 ${displayName} KEY REVERSAL ZONES</b>\n`;
      zoneMsg += `<code>Timeframe: ${tfDisplay}</code>\n\n`;

      analysis.reversalZones.slice(0, 5).forEach((z, i) => {
        const arrow = z.type === 'resistance' ? '↑' : '↓';
        const nearby = z.isNearby ? '⚠️' : '';
        zoneMsg += `${i + 1}. ${arrow} ${formatters.formatCoinPrice(z.price, displayName)} ${nearby}\n`;
        zoneMsg += `   Confluence: ${z.confluenceScore}x (${z.factors.slice(0, 2).join(' + ')})\n`;
        zoneMsg += `   Distance: ${z.distancePercent >= 0 ? '+' : ''}${z.distancePercent.toFixed(2)}%\n\n`;
      });

      // Trading guidance
      const nearbyZone = analysis.reversalZones.find(z => z.isNearby);
      if (nearbyZone) {
        zoneMsg += `⚠️ <b>ALERT:</b> Price near ${nearbyZone.type} zone!\n`;
        zoneMsg += `Watch for confirmation before trading.\n`;
      }

      await bot.sendMessage(chatId, zoneMsg, { parse_mode: 'HTML' });
    }

  } catch (error) {
    logger.error('Gann command error', { error: error.message, symbol, chatId });

    try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}

    let errorMsg = `⚠️ Unable to analyze ${symbol}.\n\n`;
    if (error.message.includes('not found')) {
      errorMsg += `Symbol not found on Bybit. Try: ${symbol}USDT`;
    } else {
      errorMsg += `Error: ${error.message}`;
    }

    await bot.sendMessage(chatId, errorMsg, { parse_mode: 'HTML' });
  }
}

/**
 * Handle /gann with Model 2 - Quant Engine
 * Hybrid Multi-Confirmation Analysis with AI explanations
 */
async function handleGannModel2(bot, msg, chatId, symbol, bybitSymbol, timeframe, tfDisplay) {
  const loadingMsg = await bot.sendMessage(chatId,
    `🔄 Analyzing <b>${symbol}</b> on <b>${tfDisplay}</b>...\n\n<i>Model 2: Quant Engine (AI-powered)</i>`,
    { parse_mode: 'HTML' }
  );

  try {
    // Run Quant Engine analysis
    const result = await quantEngine.analyze(bybitSymbol);

    // Delete loading message
    try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}

    // ═══════════════════════════════════════════════════════════════
    // MESSAGE 1: QUANT ENGINE OVERVIEW
    // ═══════════════════════════════════════════════════════════════
    const stateEmoji = result.finalState === 'ACTIONABLE' ? '🟢' :
                       result.finalState === 'WAIT' ? '🟡' : '⚪';
    const biasEmoji = result.dailyBias === 'BULLISH' ? '🟢' :
                      result.dailyBias === 'BEARISH' ? '🔴' : '⚪';

    let msg1 = `<b>🧠 ${symbol} QUANT ENGINE ANALYSIS</b>\n`;
    msg1 += `<code>${formatters.formatTime(new Date())} | Model 2</code>\n\n`;

    // Decision State
    msg1 += `<b>DECISION:</b> ${stateEmoji} <b>${result.finalState}</b>\n`;
    msg1 += `Confidence: ${(result.confidence * 100).toFixed(0)}%\n\n`;

    // Current Price & Daily Bias
    msg1 += `<b>💰 ${formatters.formatCoinPrice(result.currentPrice, symbol)}</b>\n`;
    msg1 += `Daily Bias: ${biasEmoji} ${result.dailyBias}\n\n`;

    // Daily Context
    if (result.dailyContext) {
      msg1 += `<b>📊 DAILY CONTEXT</b>\n`;
      msg1 += `Daily Open: ${formatters.formatCoinPrice(result.dailyContext.dailyOpen, symbol)}\n`;
      msg1 += `PDH: ${formatters.formatCoinPrice(result.dailyContext.pdh, symbol)}\n`;
      msg1 += `PDL: ${formatters.formatCoinPrice(result.dailyContext.pdl, symbol)}\n`;
      if (result.dailyContext.isCompressed) msg1 += `⚠️ Market COMPRESSED - expect expansion\n`;
      if (result.dailyContext.isExpanded) msg1 += `⚠️ Market EXPANDED - volatility high\n`;
      msg1 += `\n`;
    }

    // Time Sensitivity
    msg1 += `<b>⏰ TIME SENSITIVITY</b>\n`;
    if (result.timeSensitive) {
      msg1 += `✅ ACTIVE: ${result.timeWindow}\n`;
      msg1 += `Hours from midnight: ${result.timeDetails?.hoursFromMidnight?.toFixed(1)}h\n`;
    } else {
      msg1 += `❌ Outside time window\n`;
      msg1 += `Next window: ${result.timeDetails?.nextWindow || 'N/A'}\n`;
    }
    msg1 += `\n`;

    // Price Location
    msg1 += `<b>📍 PRICE LOCATION</b>\n`;
    msg1 += `Zone: <b>${result.priceLocation || 'NEUTRAL'}</b>\n`;
    if (result.priceDetails?.reason) {
      msg1 += `${result.priceDetails.reason}\n`;
    }

    await bot.sendMessage(chatId, msg1, { parse_mode: 'HTML' });

    // ═══════════════════════════════════════════════════════════════
    // MESSAGE 2: CONFIRMATIONS
    // ═══════════════════════════════════════════════════════════════
    let msg2 = `<b>✅ CONFIRMATION MODULES</b>\n\n`;

    const confirmations = result.confirmations || {};
    const details = result.confirmationDetails || {};

    // Natural Time Ratio
    const ntrIcon = confirmations.naturalTimeRatio ? '✅' : '❌';
    msg2 += `${ntrIcon} <b>Natural Time Ratio</b>\n`;
    if (details.naturalTimeRatio?.reason) {
      msg2 += `   ${details.naturalTimeRatio.reason}\n`;
    }
    if (details.naturalTimeRatio?.explanation) {
      msg2 += `   <i>${details.naturalTimeRatio.explanation}</i>\n`;
    }
    msg2 += `\n`;

    // Market Breath
    const mbIcon = confirmations.marketBreath ? '✅' : '❌';
    msg2 += `${mbIcon} <b>Market Breath</b>\n`;
    if (details.marketBreath?.reason) {
      msg2 += `   ${details.marketBreath.reason}\n`;
    }
    if (details.marketBreath?.explanation) {
      msg2 += `   <i>${details.marketBreath.explanation}</i>\n`;
    }
    msg2 += `\n`;

    // Odd-Even Impulse
    const oeIcon = confirmations.oddEvenImpulse ? '✅' : '❌';
    msg2 += `${oeIcon} <b>Odd-Even Impulse</b>\n`;
    if (details.oddEvenImpulse?.reason) {
      msg2 += `   ${details.oddEvenImpulse.reason}\n`;
    }
    if (details.oddEvenImpulse?.explanation) {
      msg2 += `   <i>${details.oddEvenImpulse.explanation}</i>\n`;
    }
    msg2 += `\n`;

    // Time-Price Equality
    const tpeIcon = confirmations.timePriceEquality ? '✅' : '❌';
    msg2 += `${tpeIcon} <b>Time-Price Equality</b>\n`;
    if (details.timePriceEquality?.reason) {
      msg2 += `   ${details.timePriceEquality.reason}\n`;
    }
    if (details.timePriceEquality?.explanation) {
      msg2 += `   <i>${details.timePriceEquality.explanation}</i>\n`;
    }
    msg2 += `\n`;

    // Midnight Memory
    const mmIcon = confirmations.midnightMemory ? '✅' : '❌';
    msg2 += `${mmIcon} <b>Midnight Memory</b>\n`;
    if (details.midnightMemory?.reason) {
      msg2 += `   ${details.midnightMemory.reason}\n`;
    }
    if (details.midnightMemory?.explanation) {
      msg2 += `   <i>${details.midnightMemory.explanation}</i>\n`;
    }

    await bot.sendMessage(chatId, msg2, { parse_mode: 'HTML' });

    // ═══════════════════════════════════════════════════════════════
    // MESSAGE 3: AI EXPLANATION (Crystal Clear Guidance)
    // ═══════════════════════════════════════════════════════════════
    let msg3 = `<b>🤖 AI ANALYSIS</b>\n`;
    msg3 += `<i>Crystal Clear Trading Guidance</i>\n\n`;

    if (result.aiExplanation) {
      msg3 += result.aiExplanation;
    } else {
      msg3 += `<i>AI explanation unavailable. Using rule-based analysis.</i>\n\n`;
      if (result.actionGuidance) {
        msg3 += `<b>Guidance:</b> ${result.actionGuidance}`;
      }
    }

    msg3 += `\n\n<code>─────────────────────</code>\n`;
    msg3 += `<i>Quant Engine v1.0 | /model1 for Classic</i>`;

    await bot.sendMessage(chatId, msg3, { parse_mode: 'HTML' });

  } catch (error) {
    logger.error('Quant Engine error', { error: error.message, symbol, chatId });

    try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}

    let errorMsg = `⚠️ Quant Engine analysis failed for ${symbol}.\n\n`;
    errorMsg += `Error: ${error.message}\n\n`;
    errorMsg += `<i>Try /model1 to use Classic analysis</i>`;

    await bot.sendMessage(chatId, errorMsg, { parse_mode: 'HTML' });
  }
}

/**
 * Handle /planets command
 */
async function handlePlanets(bot, msg) {
  const chatId = msg.chat.id;

  try {
    const planets = planetary.getCurrentPlanets();
    const moon = planetary.getMoonInfo();
    const aspectData = planetary.getAspects();
    const majorEvents = planetary.scanMajorEvents(null, 7);

    const planetaryMsg = formatters.formatPlanetary({
      planets,
      moon,
      aspects: aspectData.aspects,
      majorEvents: majorEvents.events,
      timestamp: new Date()
    });

    await bot.sendMessage(chatId, planetaryMsg, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Planets command error', { error: error.message, chatId });
    await bot.sendMessage(chatId, formatters.formatError(error, '/planets'), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /confluence command
 */
async function handleConfluence(bot, msg) {
  const chatId = msg.chat.id;

  try {
    const priceData = await getCurrentPrice();

    if (!priceData) {
      await bot.sendMessage(chatId, '⚠️ Unable to fetch current price. Please try again later.');
      return;
    }

    const confluenceData = await confluence.calculate(priceData.price);

    const confMsg = formatters.formatConfluence({
      price: priceData.price,
      score: confluenceData.score,
      bias: confluenceData.bias,
      components: confluenceData.components,
      timestamp: new Date()
    });

    await bot.sendMessage(chatId, confMsg, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Confluence command error', { error: error.message, chatId });
    await bot.sendMessage(chatId, formatters.formatError(error, '/confluence'), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /levels command
 */
async function handleLevels(bot, msg) {
  const chatId = msg.chat.id;

  try {
    const priceData = await getCurrentPrice();

    if (!priceData) {
      await bot.sendMessage(chatId, '⚠️ Unable to fetch current price. Please try again later.');
      return;
    }

    const price = priceData.price;
    const targets = gann.calculateTargets(price, 0.5, 5);

    let levelsMsg = `<b>🎯 KEY PRICE LEVELS</b>\n`;
    levelsMsg += `<code>${formatters.formatTime(new Date())}</code>\n\n`;
    levelsMsg += `<b>BTC:</b> ${formatters.formatPrice(price)}\n\n`;

    // Supports
    levelsMsg += `<b>↓ SUPPORT LEVELS</b>\n`;
    targets.supports.slice(0, 5).forEach(s => {
      levelsMsg += `${formatters.formatPrice(s.level)} (${formatters.formatPercent(s.percentFromPrice)}) [${s.source}]\n`;
    });
    levelsMsg += '\n';

    // Resistances
    levelsMsg += `<b>↑ RESISTANCE LEVELS</b>\n`;
    targets.resistances.slice(0, 5).forEach(r => {
      levelsMsg += `${formatters.formatPrice(r.level)} (${formatters.formatPercent(r.percentFromPrice)}) [${r.source}]\n`;
    });
    levelsMsg += '\n';

    // Key convergence levels
    if (targets.keyLevels?.length > 0) {
      levelsMsg += `<b>⭐ CONVERGENCE LEVELS</b>\n`;
      targets.keyLevels.slice(0, 5).forEach(k => {
        const arrow = k.direction === 'resistance' ? '↑' : '↓';
        levelsMsg += `${arrow} ${formatters.formatPrice(k.level)} [${k.sources?.join('+')}] (${k.convergence}x)\n`;
      });
    }

    await bot.sendMessage(chatId, levelsMsg, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Levels command error', { error: error.message, chatId });
    await bot.sendMessage(chatId, formatters.formatError(error, '/levels'), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /cycles command
 */
async function handleCycles(bot, msg) {
  const chatId = msg.chat.id;

  try {
    const events = await getHistoricalEvents();
    const cycleAnalysis = gann.analyzeCycles(new Date(), events);

    let cyclesMsg = `<b>⏳ CYCLE ANALYSIS</b>\n`;
    cyclesMsg += `<code>${formatters.formatTime(new Date())}</code>\n\n`;

    cyclesMsg += `<b>Convergence:</b> ${(cycleAnalysis.convergenceScore * 100).toFixed(0)}%\n`;
    cyclesMsg += `<b>Bias:</b> ${cycleAnalysis.cycleBias?.toUpperCase() || 'NEUTRAL'}\n\n`;

    if (cycleAnalysis.majorHits?.length > 0) {
      cyclesMsg += `<b>🎯 MAJOR CYCLE HITS</b>\n`;
      cycleAnalysis.majorHits.slice(0, 5).forEach(hit => {
        cyclesMsg += `• ${hit.cycleLength}d x${hit.multiplier} from ${hit.event?.type || 'event'}\n`;
        cyclesMsg += `  Strength: ${(hit.strength * 100).toFixed(0)}%\n`;
      });
      cyclesMsg += '\n';
    }

    if (cycleAnalysis.upcomingCycles?.length > 0) {
      cyclesMsg += `<b>📅 UPCOMING CYCLES</b>\n`;
      cycleAnalysis.upcomingCycles.slice(0, 5).forEach(up => {
        const marker = up.isMajor ? '🔴' : '⚪';
        cyclesMsg += `${marker} ${up.date} (${up.daysUntil}d) - ${up.cycleLength}d cycle\n`;
      });
    }

    await bot.sendMessage(chatId, cyclesMsg, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Cycles command error', { error: error.message, chatId });
    await bot.sendMessage(chatId, formatters.formatError(error, '/cycles'), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /coin command - Comprehensive analysis for any coin
 * Usage: /coin XRP or /coin ETHUSDT
 */
async function handleCoin(bot, msg, match) {
  const chatId = msg.chat.id;

  // Extract symbol from command
  const text = msg.text || '';
  const parts = text.split(/\s+/);
  const symbolInput = parts[1];

  if (!symbolInput) {
    await bot.sendMessage(chatId,
      `<b>📊 COIN ANALYSIS</b>\n\n` +
      `Usage: <code>/coin SYMBOL</code>\n\n` +
      `Examples:\n` +
      `• /coin XRP\n` +
      `• /coin ETH\n` +
      `• /coin SOL\n` +
      `• /coin DOGE\n\n` +
      `Supported: BTC, ETH, XRP, SOL, BNB, ADA, DOGE, AVAX, DOT, LINK, MATIC, UNI, ATOM, LTC, NEAR, APT, ARB, OP, SUI, PEPE, SHIB, INJ, SEI, JUP, WIF and more...`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (!coinAnalysis) {
    await bot.sendMessage(chatId, '⚠️ Coin analysis module not available.');
    return;
  }

  // Send "analyzing" message
  const loadingMsg = await bot.sendMessage(chatId,
    `🔄 Analyzing <b>${symbolInput.toUpperCase()}</b>...\n\nFetching price, historical data, Gann levels, planetary positions...`,
    { parse_mode: 'HTML' }
  );

  try {
    const analysis = await coinAnalysis.analyzeCoin(symbolInput);

    // Format and send the comprehensive analysis
    const analysisMsg = formatters.formatCoinAnalysis(analysis);

    // Delete loading message
    try {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {
      // Ignore delete errors
    }

    // Send main analysis
    await bot.sendMessage(chatId, analysisMsg, { parse_mode: 'HTML' });

    // Send planetary price levels (Billionaire Methods)
    if (analysis.planetaryPrice) {
      const planetaryMsg = formatters.formatPlanetaryPriceLevels(analysis);
      await bot.sendMessage(chatId, planetaryMsg, { parse_mode: 'HTML' });
    }

    // Send trading scenarios as separate message
    if (analysis.scenarios && analysis.scenarios.length > 0) {
      const scenariosMsg = formatters.formatTradingScenarios(analysis);
      await bot.sendMessage(chatId, scenariosMsg, { parse_mode: 'HTML' });
    }

  } catch (error) {
    logger.error('Coin command error', { error: error.message, symbol: symbolInput, chatId });

    try {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {}

    let errorMsg = `⚠️ Unable to analyze ${symbolInput.toUpperCase()}.\n\n`;
    if (error.message.includes('not found')) {
      errorMsg += `Symbol not found on Bybit. Try:\n• ${symbolInput.toUpperCase()}USDT\n• Check spelling`;
    } else {
      errorMsg += `Error: ${error.message}`;
    }

    await bot.sendMessage(chatId, errorMsg, { parse_mode: 'HTML' });
  }
}

/**
 * Handle /test command - Test all modules and APIs
 */
async function handleTest(bot, msg) {
  const chatId = msg.chat.id;

  const loadingMsg = await bot.sendMessage(chatId,
    '🔄 <b>Testing all modules and APIs...</b>',
    { parse_mode: 'HTML' }
  );

  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  // Test 1: Bybit API
  try {
    if (bybit) {
      const ticker = await bybit.bybitClient.getTickerBySymbol('BTCUSDT', 'linear');
      if (ticker && ticker.lastPrice) {
        results.passed.push(`✅ Bybit API: BTC = $${ticker.lastPrice.toLocaleString()}`);
      } else {
        results.warnings.push('⚠️ Bybit API: Connected but no price data');
      }
    } else {
      results.failed.push('❌ Bybit module not loaded');
    }
  } catch (e) {
    results.failed.push(`❌ Bybit API: ${e.message}`);
  }

  // Test 2: Bybit Klines
  try {
    if (bybit) {
      const klines = await bybit.bybitClient.getKlineData({ symbol: 'BTCUSDT', interval: '60', limit: 10 });
      if (klines && klines.list && klines.list.length > 0) {
        results.passed.push(`✅ Bybit Klines: ${klines.list.length} candles fetched`);
      } else {
        results.warnings.push('⚠️ Bybit Klines: No data returned');
      }
    }
  } catch (e) {
    results.failed.push(`❌ Bybit Klines: ${e.message}`);
  }

  // Test 3: Gann Module
  try {
    const sq9 = gann.squareOf9(50000);
    const wheel24 = gann.wheelOf24(50000);
    if (sq9 && sq9.degreePosition !== undefined && wheel24) {
      results.passed.push(`✅ Gann Sq9: ${sq9.degreePosition.toFixed(1)}° | Wheel24: Q${wheel24.wheelPosition?.quadrant}`);
    } else {
      results.warnings.push('⚠️ Gann module returned incomplete data');
    }
  } catch (e) {
    results.failed.push(`❌ Gann module: ${e.message}`);
  }

  // Test 4: Planetary Module
  try {
    const planets = planetary.getCurrentPlanets();
    const moon = planetary.getMoonInfo();
    const aspects = planetary.getAspects();
    if (planets && moon && aspects) {
      const planetCount = Object.keys(planets).length;
      results.passed.push(`✅ Planetary: ${planetCount} planets | Moon: ${moon.phase} | ${aspects.aspects?.length || 0} aspects`);
    } else {
      results.warnings.push('⚠️ Planetary module returned incomplete data');
    }
  } catch (e) {
    results.failed.push(`❌ Planetary module: ${e.message}`);
  }

  // Test 5: Planetary Price Module
  try {
    if (planetaryPrice) {
      const priceLevels = planetaryPrice.calculatePlanetaryPriceLevels(50000, 'BTC');
      const lunarCycle = planetaryPrice.calculateLunarCycleZones();
      if (priceLevels && priceLevels.levels && lunarCycle) {
        results.passed.push(`✅ Planetary Price: ${priceLevels.levels.length} levels | Lunar: ${lunarCycle.tradingZone}`);
      } else {
        results.warnings.push('⚠️ Planetary Price module returned incomplete data');
      }
    } else {
      results.failed.push('❌ Planetary Price module not loaded');
    }
  } catch (e) {
    results.failed.push(`❌ Planetary Price: ${e.message}`);
  }

  // Test 6: Confluence Module
  try {
    const confResult = await confluence.calculate(50000);
    if (confResult && confResult.score !== undefined) {
      results.passed.push(`✅ Confluence: Score ${(confResult.score * 100).toFixed(0)}% | Bias: ${confResult.bias}`);
    } else {
      results.warnings.push('⚠️ Confluence module returned incomplete data');
    }
  } catch (e) {
    results.failed.push(`❌ Confluence: ${e.message}`);
  }

  // Test 7: Database Connection
  try {
    const pool = db.getPool();
    if (pool) {
      const dbResult = await pool.query('SELECT NOW() as time');
      results.passed.push(`✅ Database: Connected (${dbResult.rows[0].time.toISOString().split('T')[0]})`);
    } else {
      results.warnings.push('⚠️ Database: No connection pool');
    }
  } catch (e) {
    results.warnings.push(`⚠️ Database: ${e.message}`);
  }

  // Test 8: CoinGecko (optional)
  try {
    if (coingecko) {
      const global = await coingecko.coinGeckoClient.fetchGlobalData();
      if (global && global.totalMarketCap) {
        results.passed.push(`✅ CoinGecko: Total MCap $${(global.totalMarketCap / 1e12).toFixed(2)}T`);
      } else {
        results.warnings.push('⚠️ CoinGecko: No data returned');
      }
    } else {
      results.warnings.push('⚠️ CoinGecko module not loaded (optional)');
    }
  } catch (e) {
    results.warnings.push(`⚠️ CoinGecko: ${e.message} (optional)`);
  }

  // Test 9: Full Coin Analysis
  try {
    if (coinAnalysis) {
      const analysis = await coinAnalysis.analyzeCoin('BTC');
      if (analysis && analysis.price && analysis.gann && analysis.planetary) {
        results.passed.push(`✅ Coin Analysis: BTC $${analysis.price.current.toLocaleString()} | Full data OK`);
      } else {
        results.warnings.push('⚠️ Coin Analysis: Incomplete data');
      }
    } else {
      results.failed.push('❌ Coin Analysis module not loaded');
    }
  } catch (e) {
    results.failed.push(`❌ Coin Analysis: ${e.message}`);
  }

  // Test 10: Market Radar (optional)
  try {
    if (marketRadar) {
      const radar = await marketRadar.scanMarket();
      if (radar) {
        results.passed.push(`✅ Market Radar: ${radar.totalCoins || 'N/A'} coins scanned`);
      } else {
        results.warnings.push('⚠️ Market Radar: No data returned');
      }
    } else {
      results.warnings.push('⚠️ Market Radar not loaded (optional)');
    }
  } catch (e) {
    results.warnings.push(`⚠️ Market Radar: ${e.message} (optional)`);
  }

  // Delete loading message
  try {
    await bot.deleteMessage(chatId, loadingMsg.message_id);
  } catch (e) {}

  // Build result message
  let testMsg = `<b>🧪 SYSTEM TEST RESULTS</b>\n`;
  testMsg += `<code>${formatters.formatTime(new Date())}</code>\n\n`;

  testMsg += `<b>Summary:</b>\n`;
  testMsg += `✅ Passed: ${results.passed.length}\n`;
  testMsg += `⚠️ Warnings: ${results.warnings.length}\n`;
  testMsg += `❌ Failed: ${results.failed.length}\n\n`;

  if (results.passed.length > 0) {
    testMsg += `<b>Passed Tests:</b>\n`;
    results.passed.forEach(p => testMsg += `${p}\n`);
    testMsg += '\n';
  }

  if (results.warnings.length > 0) {
    testMsg += `<b>Warnings:</b>\n`;
    results.warnings.forEach(w => testMsg += `${w}\n`);
    testMsg += '\n';
  }

  if (results.failed.length > 0) {
    testMsg += `<b>Failed:</b>\n`;
    results.failed.forEach(f => testMsg += `${f}\n`);
    testMsg += '\n';
  }

  const overallStatus = results.failed.length === 0 ?
    (results.warnings.length === 0 ? '🟢 ALL SYSTEMS OPERATIONAL' : '🟡 OPERATIONAL WITH WARNINGS') :
    '🔴 SOME SYSTEMS FAILING';

  testMsg += `<b>Status:</b> ${overallStatus}`;

  await bot.sendMessage(chatId, testMsg, { parse_mode: 'HTML' });
}

/**
 * Handle /scan command - Scan all Bybit tickers for reversals
 */
async function handleScan(bot, msg) {
  const chatId = msg.chat.id;

  if (!reversalScanner) {
    await bot.sendMessage(chatId, '⚠️ Reversal scanner module not available.');
    return;
  }

  const loadingMsg = await bot.sendMessage(chatId,
    '🔍 <b>Scanning all Bybit perpetuals for reversals...</b>\n\nAnalyzing Gann, Planetary, Price-Time alignments...',
    { parse_mode: 'HTML' }
  );

  try {
    const scanResult = await reversalScanner.scanAllTickers({
      minScore: 30,
      maxResults: 10
    });

    // Delete loading message
    try {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {}

    // Format summary
    let scanMsg = `<b>🔍 REVERSAL SCAN RESULTS</b>\n`;
    scanMsg += `<code>${formatters.formatTime(new Date())}</code>\n\n`;
    scanMsg += `Tickers scanned: <b>${scanResult.tickersScanned}</b>\n`;
    scanMsg += `Reversals found: <b>${scanResult.reversalsFound}</b>\n`;
    scanMsg += `Scan time: ${scanResult.scanDurationMs}ms\n\n`;

    if (scanResult.results.length === 0) {
      scanMsg += `<i>No high-confluence reversals detected.</i>\n\n`;
      scanMsg += `Try again later or lower the threshold.`;
      await bot.sendMessage(chatId, scanMsg, { parse_mode: 'HTML' });
      return;
    }

    scanMsg += `<b>🎯 TOP REVERSAL OPPORTUNITIES:</b>\n\n`;

    scanResult.results.forEach((r, i) => {
      const emoji = r.reversalScore.rating === 'HIGH' ? '🔴' : r.reversalScore.rating === 'MEDIUM' ? '🟡' : '⚪';
      const priceStr = r.price < 1
        ? `$${r.price.toFixed(6)}`
        : `$${r.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

      scanMsg += `${i + 1}. ${emoji} <b>${r.baseCoin}</b> - Score: ${r.reversalScore.percentage}%\n`;
      scanMsg += `   ${priceStr} (${r.change24h >= 0 ? '+' : ''}${r.change24h.toFixed(1)}%)\n`;

      // Show factors
      r.reversalScore.factors.slice(0, 2).forEach(f => {
        scanMsg += `   • ${f}\n`;
      });
      scanMsg += `\n`;
    });

    // Add explanation
    scanMsg += `<b>📐 LEGEND:</b>\n`;
    scanMsg += `🔴 HIGH (60%+) = Strong reversal zone\n`;
    scanMsg += `🟡 MEDIUM (40-59%) = Watch for confirmation\n`;
    scanMsg += `⚪ LOW (<40%) = Minor signal\n\n`;

    scanMsg += `<i>Use /coin [SYMBOL] for detailed analysis</i>`;

    await bot.sendMessage(chatId, scanMsg, { parse_mode: 'HTML' });

    // Also check Price-Time alignments
    const ptAlignments = await reversalScanner.scanPriceTimeAlignments();
    if (ptAlignments.alignments.length > 0) {
      let ptMsg = `\n<b>⏰ PRICE-TIME SQUARE ALIGNMENTS</b>\n`;
      ptMsg += `<i>Gann's most powerful reversal signal</i>\n\n`;

      ptAlignments.alignments.slice(0, 5).forEach(a => {
        ptMsg += `<b>${a.baseCoin}</b>: ${a.daysSince}d × ${a.multiplier} = $${a.targetPrice.toLocaleString()}\n`;
        ptMsg += `   From: ${a.event} | Accuracy: ${a.accuracy}\n\n`;
      });

      await bot.sendMessage(chatId, ptMsg, { parse_mode: 'HTML' });
    }

  } catch (error) {
    logger.error('Scan command error', { error: error.message, chatId });

    try {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {}

    await bot.sendMessage(chatId,
      `⚠️ Scan failed: ${error.message}`,
      { parse_mode: 'HTML' }
    );
  }
}

/**
 * Handle /explain command - Explain Gann methods
 */
async function handleExplain(bot, msg) {
  const chatId = msg.chat.id;

  if (!reversalScanner) {
    await bot.sendMessage(chatId, '⚠️ Module not available.');
    return;
  }

  const explanation = reversalScanner.getGannExplanation();

  let msg1 = `<b>📚 GANN METHODS EXPLAINED</b>\n\n`;

  // Square of 9
  msg1 += `<b>🔢 ${explanation.squareOf9.title}</b>\n`;
  msg1 += `${explanation.squareOf9.description}\n\n`;
  msg1 += `<b>Key Points:</b>\n`;
  explanation.squareOf9.keyPoints.forEach(p => {
    msg1 += `• ${p}\n`;
  });
  msg1 += `\n<b>Trading:</b> ${explanation.squareOf9.trading}\n\n`;

  // Wheel of 24
  msg1 += `<b>🎡 ${explanation.wheelOf24.title}</b>\n`;
  msg1 += `${explanation.wheelOf24.description}\n\n`;
  msg1 += `<b>Quadrants:</b>\n`;
  explanation.wheelOf24.quadrants.forEach(q => {
    msg1 += `• ${q}\n`;
  });
  msg1 += `\n<b>Trading:</b> ${explanation.wheelOf24.trading}`;

  await bot.sendMessage(chatId, msg1, { parse_mode: 'HTML' });

  // Price-Time Square (separate message)
  let msg2 = `<b>⏰ ${explanation.priceTimeSquare.title}</b>\n`;
  msg2 += `<i>The Billionaire's Secret</i>\n\n`;
  msg2 += `${explanation.priceTimeSquare.description}\n\n`;
  msg2 += `<b>Method:</b>\n`;
  explanation.priceTimeSquare.method.forEach((m, i) => {
    msg2 += `${i + 1}. ${m}\n`;
  });
  msg2 += `\n<b>Example:</b>\n${explanation.priceTimeSquare.example}\n\n`;
  msg2 += `<i>This is how Gann predicted exact tops/bottoms decades in advance.</i>`;

  await bot.sendMessage(chatId, msg2, { parse_mode: 'HTML' });
}

/**
 * Handle /model command - Show current model
 */
async function handleModel(bot, msg) {
  const chatId = msg.chat.id;
  const currentModel = await getUserModel(chatId);

  const modelName = currentModel === 1 ? 'CLASSIC' : 'QUANT';
  const modelDesc = currentModel === 1
    ? 'Traditional Gann + Planetary analysis'
    : 'Hybrid Multi-Confirmation Engine with AI explanations';

  let modelMsg = `<b>🔧 ANALYSIS MODEL</b>\n\n`;
  modelMsg += `Current: <b>Model ${currentModel} (${modelName})</b>\n`;
  modelMsg += `<i>${modelDesc}</i>\n\n`;

  modelMsg += `<b>Available Models:</b>\n`;
  modelMsg += `• /model1 - Classic Gann + Planetary\n`;
  modelMsg += `• /model2 - Quant Engine (AI-powered)\n\n`;

  modelMsg += `<i>Use /gann COIN [TF] with your selected model</i>`;

  await bot.sendMessage(chatId, modelMsg, { parse_mode: 'HTML' });
}

/**
 * Handle /model1 command - Switch to Classic model
 */
async function handleModel1(bot, msg) {
  const chatId = msg.chat.id;

  await setUserModel(chatId, 1);

  let switchMsg = `<b>✅ MODEL SWITCHED</b>\n\n`;
  switchMsg += `Now using: <b>Model 1 - CLASSIC</b>\n\n`;
  switchMsg += `<b>Features:</b>\n`;
  switchMsg += `• Gann Square of 9 & Wheel of 24\n`;
  switchMsg += `• Planetary price levels\n`;
  switchMsg += `• Lunar cycle zones\n`;
  switchMsg += `• Price-Time Square alignment\n`;
  switchMsg += `• Reversal zones with confluence\n\n`;
  switchMsg += `<i>Use /gann COIN [TF] for analysis</i>`;

  await bot.sendMessage(chatId, switchMsg, { parse_mode: 'HTML' });
}

/**
 * Handle /model2 command - Switch to Quant Engine
 */
async function handleModel2(bot, msg) {
  const chatId = msg.chat.id;

  if (!quantEngine) {
    await bot.sendMessage(chatId,
      '⚠️ Quant Engine module not available. Please try again later.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  await setUserModel(chatId, 2);

  let switchMsg = `<b>✅ MODEL SWITCHED</b>\n\n`;
  switchMsg += `Now using: <b>Model 2 - QUANT ENGINE</b>\n\n`;
  switchMsg += `<b>Features:</b>\n`;
  switchMsg += `• Daily + Intraday dual-layer analysis\n`;
  switchMsg += `• Wheel of 24 time sensitivity\n`;
  switchMsg += `• Natural Time Ratios (Fibonacci)\n`;
  switchMsg += `• Market Breath (compression/expansion)\n`;
  switchMsg += `• Odd-Even Impulse exhaustion\n`;
  switchMsg += `• Time-Price Equality\n`;
  switchMsg += `• Midnight Memory anchoring\n`;
  switchMsg += `• <b>Gemini AI explanations</b>\n\n`;
  switchMsg += `<b>Decision Output:</b>\n`;
  switchMsg += `🟢 ACTIONABLE | 🟡 WAIT | ⚪ IGNORE\n\n`;
  switchMsg += `<i>Use /gann COIN [TF] for analysis</i>`;

  await bot.sendMessage(chatId, switchMsg, { parse_mode: 'HTML' });
}

/**
 * Handle unknown command
 */
async function handleUnknown(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId,
    '❓ Unknown command. Type /help for available commands.',
    { parse_mode: 'HTML' }
  );
}

// ============================================================
// COMMAND REGISTRY
// ============================================================

const commands = {
  start: handleStart,
  help: handleHelp,
  status: handleStatus,
  gann: handleGann,
  planets: handlePlanets,
  confluence: handleConfluence,
  levels: handleLevels,
  cycles: handleCycles,
  coin: handleCoin,
  test: handleTest,
  scan: handleScan,
  explain: handleExplain,
  model: handleModel,
  model1: handleModel1,
  model2: handleModel2
};

/**
 * Register all commands with bot
 */
function registerCommands(bot) {
  // Commands that take parameters
  const paramCommands = ['coin', 'gann'];

  // Register each command
  Object.entries(commands).forEach(([command, handler]) => {
    if (paramCommands.includes(command)) {
      // Commands with parameters - match command + anything after
      bot.onText(new RegExp(`^/${command}(@\\w+)?(\\s+.*)?$`, 'i'), (msg, match) => {
        handler(bot, msg, match).catch(error => {
          logger.error(`Command /${command} failed`, { error: error.message });
        });
      });
    } else {
      // Commands without parameters
      bot.onText(new RegExp(`^/${command}(@\\w+)?$`, 'i'), (msg) => {
        handler(bot, msg).catch(error => {
          logger.error(`Command /${command} failed`, { error: error.message });
        });
      });
    }
  });

  // Handle unknown commands
  bot.onText(/^\/\w+/, (msg) => {
    const text = msg.text || '';
    const commandPart = text.split(/\s/)[0]; // Get first word
    const command = commandPart.split('@')[0].replace('/', '').toLowerCase();
    if (!commands[command]) {
      handleUnknown(bot, msg);
    }
  });

  logger.info('Bot commands registered', { commands: Object.keys(commands) });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  registerCommands,
  commands,
  // Export individual handlers for testing
  handleStart,
  handleHelp,
  handleStatus,
  handleGann,
  handleGannModel2,
  handlePlanets,
  handleConfluence,
  handleLevels,
  handleCycles,
  handleCoin,
  handleTest,
  handleScan,
  handleExplain,
  handleModel,
  handleModel1,
  handleModel2,
  // Helpers
  getCurrentPrice,
  getHistoricalEvents,
  getUserModel,
  setUserModel
};
