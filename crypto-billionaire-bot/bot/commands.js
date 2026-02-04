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
let bybit, coingecko, marketRadar, coinAnalysis, planetaryPrice, reversalScanner;
try {
  bybit = require('../modules/bybit');
  coingecko = require('../modules/coingecko');
  marketRadar = require('../modules/marketRadar');
  coinAnalysis = require('../modules/coinAnalysis');
  planetaryPrice = require('../modules/planetaryPrice');
  reversalScanner = require('../modules/reversalScanner');
} catch (e) {
  logger.warn('Some market modules not available', { error: e.message });
}

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
 * Handle /gann command
 */
async function handleGann(bot, msg) {
  const chatId = msg.chat.id;

  try {
    const priceData = await getCurrentPrice();

    if (!priceData) {
      await bot.sendMessage(chatId, '⚠️ Unable to fetch current price. Please try again later.');
      return;
    }

    const price = priceData.price;

    // Run Gann analyses
    const sq9 = gann.squareOf9(price);
    const wheel24 = gann.wheelOf24(price);
    const targets = gann.calculateTargets(price, 0.5, 5);

    const gannMsg = formatters.formatGann({
      price,
      sq9,
      wheel24,
      targets,
      timestamp: new Date()
    });

    await bot.sendMessage(chatId, gannMsg, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Gann command error', { error: error.message, chatId });
    await bot.sendMessage(chatId, formatters.formatError(error, '/gann'), { parse_mode: 'HTML' });
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
  explain: handleExplain
};

/**
 * Register all commands with bot
 */
function registerCommands(bot) {
  // Commands that take parameters
  const paramCommands = ['coin'];

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
  handlePlanets,
  handleConfluence,
  handleLevels,
  handleCycles,
  handleCoin,
  handleTest,
  handleScan,
  handleExplain,
  // Helpers
  getCurrentPrice,
  getHistoricalEvents
};
