/**
 * MESSAGE FORMATTERS
 * ==================
 * Telegram message formatting utilities
 * All formatting in HTML mode for rich display
 */

const logger = require('../utils/logger');
const { ZODIAC_SIGNS, MAJOR_ASPECTS } = require('../config/constants');

// ============================================================
// CONSTANTS
// ============================================================

const TREND_EMOJI = {
  bullish: '🟢',
  bearish: '🔴',
  neutral: '⚪'
};

const CONFIDENCE_EMOJI = {
  high: '🔥',
  medium: '⚡',
  low: '💭'
};

const REGIME_EMOJI = {
  'EXTREME_GREED': '🚀',
  'GREED': '📈',
  'NEUTRAL': '➡️',
  'FEAR': '📉',
  'EXTREME_FEAR': '💀'
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Format price with comma separators
 */
function formatPrice(price, decimals = 2) {
  if (price === null || price === undefined) return 'N/A';
  return '$' + Number(price).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Format percentage with sign
 */
function formatPercent(pct, decimals = 2) {
  if (pct === null || pct === undefined) return 'N/A';
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(decimals) + '%';
}

/**
 * Format timestamp to IST
 */
function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/**
 * Format short date
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short'
  });
}

/**
 * Escape HTML characters for Telegram
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Create progress bar
 */
function progressBar(value, max = 100, length = 10) {
  const filled = Math.round((value / max) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ============================================================
// BRIEFING FORMATTERS
// ============================================================

/**
 * Format daily briefing message
 */
function formatDailyBriefing(data) {
  const {
    price,
    gann,
    planetary,
    marketRadar,
    confluence,
    timestamp = new Date()
  } = data;

  const istTime = formatTime(timestamp);
  const trendEmoji = TREND_EMOJI[confluence?.bias || 'neutral'];

  let msg = `<b>🌅 DAILY BRIEFING</b>\n`;
  msg += `<code>${istTime}</code>\n\n`;

  // Current Price
  msg += `<b>BTC/USDT:</b> ${formatPrice(price)}\n\n`;

  // Confluence Score
  if (confluence) {
    const confBar = progressBar(confluence.score * 100);
    msg += `<b>⚡ Confluence:</b> ${(confluence.score * 100).toFixed(0)}%\n`;
    msg += `${confBar} ${trendEmoji} ${confluence.bias.toUpperCase()}\n\n`;
  }

  // Gann Levels
  if (gann?.sq9) {
    msg += `<b>📐 GANN LEVELS</b>\n`;
    msg += `Position: ${gann.sq9.degreePosition?.toFixed(1) || 'N/A'}° on wheel\n`;

    if (gann.targets?.closestSupport) {
      msg += `Support: ${formatPrice(gann.targets.closestSupport.level)}\n`;
    }
    if (gann.targets?.closestResistance) {
      msg += `Resist: ${formatPrice(gann.targets.closestResistance.level)}\n`;
    }
    msg += '\n';
  }

  // Planetary Timing
  if (planetary) {
    msg += `<b>🌙 PLANETARY TIMING</b>\n`;

    if (planetary.moon) {
      msg += `Moon: ${planetary.moon.phaseSymbol || '🌓'} ${planetary.moon.phase || 'N/A'}\n`;
    }

    if (planetary.aspects?.length > 0) {
      const topAspect = planetary.aspects[0];
      msg += `Key Aspect: ${topAspect.planet1?.name || 'Planet'} ${topAspect.aspect?.symbol || '☌'} ${topAspect.planet2?.name || 'Planet'}\n`;
    }

    if (planetary.majorEvents?.length > 0) {
      msg += `Events: ${planetary.majorEvents.length} upcoming\n`;
    }
    msg += '\n';
  }

  // Market Radar
  if (marketRadar) {
    const regimeEmoji = REGIME_EMOJI[marketRadar.regimeLabel] || '➡️';
    msg += `<b>📡 MARKET RADAR</b>\n`;
    msg += `Regime: ${regimeEmoji} ${marketRadar.regimeLabel || 'N/A'}\n`;

    if (marketRadar.breadth) {
      const { advancing, declining } = marketRadar.breadth;
      msg += `Breadth: ${advancing || 0} up / ${declining || 0} down\n`;
    }
    msg += '\n';
  }

  // Key Levels Summary
  if (gann?.targets?.keyLevels?.length > 0) {
    msg += `<b>🎯 KEY LEVELS</b>\n`;
    gann.targets.keyLevels.slice(0, 3).forEach(level => {
      const arrow = level.direction === 'resistance' ? '↑' : '↓';
      msg += `${arrow} ${formatPrice(level.level)} (${level.sources?.join('+') || 'mixed'})\n`;
    });
    msg += '\n';
  }

  // Trading Bias Summary
  msg += `<b>📊 BIAS:</b> ${trendEmoji} ${(confluence?.bias || 'NEUTRAL').toUpperCase()}\n`;

  return msg;
}

/**
 * Format weekly war room message
 */
function formatWeeklyWarRoom(data) {
  const {
    weekNumber,
    priceStart,
    priceEnd,
    weeklyReturn,
    gann,
    planetary,
    cycleAnalysis,
    performance,
    upcomingWeek,
    timestamp = new Date()
  } = data;

  const istTime = formatTime(timestamp);
  const retEmoji = weeklyReturn >= 0 ? '🟢' : '🔴';

  let msg = `<b>🎖️ WEEKLY WAR ROOM</b>\n`;
  msg += `<code>${istTime}</code>\n\n`;

  // Week Summary
  msg += `<b>📅 Week ${weekNumber || 'N/A'} Summary</b>\n`;
  msg += `Open: ${formatPrice(priceStart)}\n`;
  msg += `Close: ${formatPrice(priceEnd)}\n`;
  msg += `Return: ${retEmoji} ${formatPercent(weeklyReturn)}\n\n`;

  // Cycle Analysis
  if (cycleAnalysis) {
    msg += `<b>⏳ CYCLE STATUS</b>\n`;
    msg += `Convergence: ${(cycleAnalysis.convergenceScore * 100).toFixed(0)}%\n`;
    msg += `Bias: ${cycleAnalysis.cycleBias?.toUpperCase() || 'NEUTRAL'}\n`;

    if (cycleAnalysis.majorHits?.length > 0) {
      msg += `Active Cycles: ${cycleAnalysis.majorHits.length}\n`;
      const topCycle = cycleAnalysis.majorHits[0];
      msg += `Top: ${topCycle.cycleLength}d from ${topCycle.event?.type || 'event'}\n`;
    }
    msg += '\n';
  }

  // Planetary Overview
  if (planetary?.majorEvents?.length > 0) {
    msg += `<b>🌟 UPCOMING CELESTIAL</b>\n`;
    planetary.majorEvents.slice(0, 3).forEach(event => {
      msg += `• ${event.type}: ${event.description || formatDate(event.date)}\n`;
    });
    msg += '\n';
  }

  // Performance Metrics
  if (performance) {
    msg += `<b>📈 MODEL PERFORMANCE</b>\n`;
    msg += `Hit Rate (24h): ${((performance.hitRate24h || 0) * 100).toFixed(0)}%\n`;
    msg += `Avg Return: ${formatPercent(performance.avgReturn || 0)}\n`;
    msg += `Snapshots: ${performance.snapshotCount || 0}\n\n`;
  }

  // Week Ahead
  if (upcomingWeek) {
    msg += `<b>🔮 WEEK AHEAD</b>\n`;
    msg += `Bias: ${TREND_EMOJI[upcomingWeek.bias] || '⚪'} ${(upcomingWeek.bias || 'NEUTRAL').toUpperCase()}\n`;
    msg += `Key Date: ${upcomingWeek.keyDate || 'N/A'}\n`;
    if (upcomingWeek.keyLevel) {
      msg += `Watch Level: ${formatPrice(upcomingWeek.keyLevel)}\n`;
    }
  }

  return msg;
}

/**
 * Format alert message
 */
function formatAlert(data) {
  const {
    type,
    price,
    confluence,
    trigger,
    timestamp = new Date()
  } = data;

  const typeEmoji = {
    'level_touch': '🎯',
    'confluence_spike': '⚡',
    'planetary_event': '🌟',
    'cycle_convergence': '⏳'
  };

  const emoji = typeEmoji[type] || '📢';
  const trendEmoji = TREND_EMOJI[confluence?.bias || 'neutral'];

  let msg = `<b>${emoji} ALERT: ${(type || 'SIGNAL').replace(/_/g, ' ').toUpperCase()}</b>\n`;
  msg += `<code>${formatTime(timestamp)}</code>\n\n`;

  msg += `<b>BTC:</b> ${formatPrice(price)}\n`;

  if (confluence) {
    msg += `<b>Confluence:</b> ${(confluence.score * 100).toFixed(0)}% ${trendEmoji}\n`;
  }

  if (trigger) {
    msg += `\n<b>Trigger:</b> ${escapeHtml(trigger)}\n`;
  }

  return msg;
}

/**
 * Format confluence analysis message
 */
function formatConfluence(data) {
  const {
    price,
    score,
    bias,
    components,
    timestamp = new Date()
  } = data;

  const trendEmoji = TREND_EMOJI[bias || 'neutral'];
  const confBar = progressBar(score * 100);

  let msg = `<b>⚡ CONFLUENCE ANALYSIS</b>\n`;
  msg += `<code>${formatTime(timestamp)}</code>\n\n`;

  msg += `<b>BTC:</b> ${formatPrice(price)}\n`;
  msg += `<b>Score:</b> ${(score * 100).toFixed(0)}%\n`;
  msg += `${confBar} ${trendEmoji}\n\n`;

  if (components) {
    msg += `<b>Components:</b>\n`;
    if (components.gannScore !== undefined) {
      msg += `• Gann: ${(components.gannScore * 100).toFixed(0)}%\n`;
    }
    if (components.cycleScore !== undefined) {
      msg += `• Cycles: ${(components.cycleScore * 100).toFixed(0)}%\n`;
    }
    if (components.planetaryScore !== undefined) {
      msg += `• Planetary: ${(components.planetaryScore * 100).toFixed(0)}%\n`;
    }
    if (components.momentumScore !== undefined) {
      msg += `• Momentum: ${(components.momentumScore * 100).toFixed(0)}%\n`;
    }
  }

  msg += `\n<b>Bias:</b> ${(bias || 'NEUTRAL').toUpperCase()}\n`;

  return msg;
}

/**
 * Format planetary info message
 */
function formatPlanetary(data) {
  const {
    planets,
    moon,
    aspects,
    majorEvents,
    timestamp = new Date()
  } = data;

  let msg = `<b>🌌 PLANETARY POSITIONS</b>\n`;
  msg += `<code>${formatTime(timestamp)}</code>\n\n`;

  // Moon Info
  if (moon) {
    msg += `<b>🌙 MOON</b>\n`;
    msg += `Phase: ${moon.phaseSymbol || '🌓'} ${moon.phase || 'N/A'}\n`;
    msg += `Illumination: ${moon.illumination?.toFixed(1) || 'N/A'}%\n`;
    if (moon.sign) {
      msg += `Sign: ${moon.sign.symbol || ''} ${moon.sign.name || 'N/A'}\n`;
    }
    msg += '\n';
  }

  // Key Planets
  if (planets && Object.keys(planets).length > 0) {
    msg += `<b>☀️ PLANETS</b>\n`;
    const keyPlanets = ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
    keyPlanets.forEach(name => {
      const planet = planets[name];
      if (planet) {
        const signSymbol = planet.sign?.symbol || '';
        msg += `${planet.symbol || '●'} ${name}: ${planet.longitude?.toFixed(1) || 'N/A'}° ${signSymbol}\n`;
      }
    });
    msg += '\n';
  }

  // Active Aspects
  if (aspects?.length > 0) {
    msg += `<b>✨ ACTIVE ASPECTS</b>\n`;
    aspects.slice(0, 5).forEach(asp => {
      const p1 = asp.planet1?.symbol || asp.planet1?.name || '?';
      const p2 = asp.planet2?.symbol || asp.planet2?.name || '?';
      const aspSymbol = asp.aspect?.symbol || '☌';
      const orb = asp.orb?.toFixed(1) || '?';
      msg += `${p1} ${aspSymbol} ${p2} (${orb}°)\n`;
    });
    msg += '\n';
  }

  // Upcoming Events
  if (majorEvents?.length > 0) {
    msg += `<b>📅 UPCOMING EVENTS</b>\n`;
    majorEvents.slice(0, 3).forEach(event => {
      const dateStr = event.date ? formatDate(event.date) : 'Soon';
      msg += `• ${event.type || 'Event'}: ${dateStr}\n`;
    });
  }

  return msg;
}

/**
 * Format Gann analysis message
 */
function formatGann(data) {
  const {
    price,
    sq9,
    wheel24,
    targets,
    angles,
    timestamp = new Date()
  } = data;

  let msg = `<b>📐 GANN ANALYSIS</b>\n`;
  msg += `<code>${formatTime(timestamp)}</code>\n\n`;

  msg += `<b>BTC:</b> ${formatPrice(price)}\n\n`;

  // Square of 9
  if (sq9) {
    msg += `<b>🔢 SQUARE OF 9</b>\n`;
    msg += `Degree: ${sq9.degreePosition?.toFixed(1) || 'N/A'}°\n`;
    msg += `In Square: ${sq9.percentInSquare?.toFixed(1) || 'N/A'}%\n`;

    const flags = [];
    if (sq9.flags?.nearCardinal) flags.push('Cardinal');
    if (sq9.flags?.nearTop) flags.push('Near Top');
    if (sq9.flags?.nearBottom) flags.push('Near Bottom');
    if (flags.length > 0) {
      msg += `Flags: ${flags.join(', ')}\n`;
    }
    msg += '\n';
  }

  // Wheel of 24
  if (wheel24) {
    msg += `<b>🎡 WHEEL OF 24</b>\n`;
    msg += `Degrees: ${wheel24.degrees?.normalized?.toFixed(1) || 'N/A'}°\n`;
    msg += `Quadrant: ${wheel24.wheelPosition?.quadrant || 'N/A'}\n`;
    msg += `${wheel24.wheelPosition?.description || ''}\n\n`;
  }

  // Key Levels
  if (targets) {
    msg += `<b>🎯 KEY LEVELS</b>\n`;

    if (targets.closestSupport) {
      msg += `↓ Support: ${formatPrice(targets.closestSupport.level)} (${formatPercent(targets.closestSupport.percentFromPrice)})\n`;
    }
    if (targets.closestResistance) {
      msg += `↑ Resist: ${formatPrice(targets.closestResistance.level)} (${formatPercent(targets.closestResistance.percentFromPrice)})\n`;
    }

    if (targets.keyLevels?.length > 0) {
      msg += `\n<b>Convergence Levels:</b>\n`;
      targets.keyLevels.slice(0, 3).forEach(level => {
        const arrow = level.direction === 'resistance' ? '↑' : '↓';
        msg += `${arrow} ${formatPrice(level.level)} [${level.sources?.join('+')}]\n`;
      });
    }
  }

  return msg;
}

/**
 * Format error message
 */
function formatError(error, context = '') {
  let msg = `<b>⚠️ Error</b>\n`;
  if (context) {
    msg += `<code>${escapeHtml(context)}</code>\n\n`;
  }
  msg += escapeHtml(error.message || String(error));
  return msg;
}

/**
 * Format help message
 */
function formatHelp() {
  return `<b>🤖 CRYPTO BILLIONAIRE BOT</b>

<b>Commands:</b>
/status - Current BTC analysis
/gann - Gann Square of 9 & Wheel
/planets - Planetary positions
/confluence - Confluence score
/levels - Key support/resistance
/coin [SYMBOL] - Full A-Z analysis
/test - Test all modules & APIs
/help - This help message

<b>Scheduled:</b>
• Daily Briefing: 5:30 AM IST
• Weekly War Room: Sat 6:00 PM IST
• Alerts: On high confluence only

<b>Note:</b> This is for analysis only.
Not financial advice. DYOR.`;
}

/**
 * Format comprehensive coin analysis
 */
function formatCoinAnalysis(analysis) {
  const {
    displayName,
    price,
    gann,
    historicalLevels,
    reversalZones,
    trend,
    planetary,
    overallConfluence,
    timestamp
  } = analysis;

  const trendEmoji = TREND_EMOJI[trend?.overall || 'neutral'];
  const biasEmoji = TREND_EMOJI[planetary?.bias?.bias || 'neutral'];

  let msg = `<b>📊 ${displayName} COMPLETE ANALYSIS</b>\n`;
  msg += `<code>${formatTime(new Date(timestamp))}</code>\n\n`;

  // ═══════════════════════════════════════════
  // PRICE DATA
  // ═══════════════════════════════════════════
  msg += `<b>💰 PRICE DATA</b>\n`;
  msg += `Current: <b>${formatCoinPrice(price.current, displayName)}</b>\n`;
  msg += `24h: ${price.change24h >= 0 ? '🟢' : '🔴'} ${formatPercent(price.change24h)}\n`;
  msg += `High: ${formatCoinPrice(price.high24h, displayName)} | Low: ${formatCoinPrice(price.low24h, displayName)}\n`;
  if (price.fundingRate !== null) {
    const frEmoji = price.fundingRate > 0 ? '📈' : '📉';
    msg += `Funding: ${frEmoji} ${price.fundingRate?.toFixed(4)}%\n`;
  }
  msg += `\n`;

  // ═══════════════════════════════════════════
  // OVERALL CONFLUENCE
  // ═══════════════════════════════════════════
  const confBar = progressBar(overallConfluence.percentage);
  msg += `<b>⚡ CONFLUENCE: ${overallConfluence.percentage}% [${overallConfluence.rating}]</b>\n`;
  msg += `${confBar}\n`;
  msg += `Active: ${overallConfluence.factors.slice(0, 3).join(' | ')}\n\n`;

  // ═══════════════════════════════════════════
  // GANN SQUARE OF 9
  // ═══════════════════════════════════════════
  msg += `<b>🔢 SQUARE OF 9</b>\n`;
  msg += `Degree: <b>${gann.squareOf9.degree?.toFixed(1)}°</b> | Position: ${gann.squareOf9.inSquare?.toFixed(1)}%\n`;

  if (gann.squareOf9.flags && Object.values(gann.squareOf9.flags).some(f => f)) {
    const activeFlags = Object.entries(gann.squareOf9.flags)
      .filter(([_, v]) => v)
      .map(([k]) => k.replace(/([A-Z])/g, ' $1').trim());
    msg += `⚠️ Flags: ${activeFlags.join(', ')}\n`;
  }

  // Sq9 Supports
  msg += `Supports: `;
  msg += gann.squareOf9.supports.slice(0, 3).map(s => formatCoinPrice(s, displayName)).join(' → ');
  msg += `\n`;

  // Sq9 Resistances
  msg += `Resist: `;
  msg += gann.squareOf9.resistances.slice(0, 3).map(r => formatCoinPrice(r, displayName)).join(' → ');
  msg += `\n\n`;

  // ═══════════════════════════════════════════
  // GANN WHEEL OF 24
  // ═══════════════════════════════════════════
  msg += `<b>🎡 WHEEL OF 24</b>\n`;
  msg += `Degree: <b>${gann.wheelOf24.degree?.toFixed(1)}°</b> | Quadrant: ${gann.wheelOf24.quadrant}\n`;
  msg += `${gann.wheelOf24.description || ''}\n`;
  if (gann.wheelOf24.nearCardinal) {
    msg += `⚠️ Near Cardinal Angle (${gann.wheelOf24.cardinalDistance?.toFixed(1)}° away)\n`;
  }
  msg += `\n`;

  // ═══════════════════════════════════════════
  // KEY REVERSAL ZONES
  // ═══════════════════════════════════════════
  if (reversalZones && reversalZones.length > 0) {
    msg += `<b>🎯 REVERSAL ZONES (Multi-Factor)</b>\n`;

    const supports = reversalZones.filter(z => z.type === 'support').slice(0, 3);
    const resistances = reversalZones.filter(z => z.type === 'resistance').slice(0, 3);

    if (resistances.length > 0) {
      msg += `<b>↑ RESISTANCE:</b>\n`;
      resistances.forEach(z => {
        const stars = '⭐'.repeat(Math.min(z.confluenceScore, 4));
        msg += `${formatCoinPrice(z.price, displayName)} (${formatPercent(z.distancePercent)}) ${stars}\n`;
        msg += `  └ ${z.factors.slice(0, 3).join(' + ')}\n`;
      });
    }

    if (supports.length > 0) {
      msg += `<b>↓ SUPPORT:</b>\n`;
      supports.forEach(z => {
        const stars = '⭐'.repeat(Math.min(z.confluenceScore, 4));
        msg += `${formatCoinPrice(z.price, displayName)} (${formatPercent(z.distancePercent)}) ${stars}\n`;
        msg += `  └ ${z.factors.slice(0, 3).join(' + ')}\n`;
      });
    }
    msg += `\n`;
  }

  // ═══════════════════════════════════════════
  // TREND ANALYSIS
  // ═══════════════════════════════════════════
  msg += `<b>📈 TREND STATUS</b>\n`;
  msg += `4H: ${TREND_EMOJI[trend.timeframe4H?.trend]} ${(trend.timeframe4H?.trend || 'N/A').toUpperCase()} (${trend.timeframe4H?.strength}%)\n`;
  msg += `Daily: ${TREND_EMOJI[trend.daily?.trend]} ${(trend.daily?.trend || 'N/A').toUpperCase()} (${trend.daily?.strength}%)\n`;
  if (trend.timeframe4H?.positionInRange !== undefined) {
    msg += `Position in Range: ${trend.timeframe4H.positionInRange}%\n`;
  }
  msg += `\n`;

  // ═══════════════════════════════════════════
  // PLANETARY BIAS
  // ═══════════════════════════════════════════
  msg += `<b>🌌 PLANETARY BIAS</b>\n`;
  msg += `Moon: ${planetary.moon?.phaseSymbol || '🌓'} ${planetary.moon?.phase || 'N/A'} (${planetary.moon?.illumination?.toFixed(0)}%)\n`;
  msg += `Bias: ${biasEmoji} ${(planetary.bias?.bias || 'NEUTRAL').toUpperCase()} (${planetary.bias?.biasStrength || 0}% strength)\n`;

  if (planetary.bias?.signals?.length > 0) {
    msg += `Signals:\n`;
    planetary.bias.signals.slice(0, 4).forEach(s => {
      const sigEmoji = s.bias === 'bullish' ? '🟢' : s.bias === 'bearish' ? '🔴' : '⚪';
      msg += `  ${sigEmoji} ${s.factor}: ${s.note}\n`;
    });
  }

  if (planetary.activeAspects?.length > 0) {
    msg += `Active: `;
    msg += planetary.activeAspects.slice(0, 3).map(a =>
      `${a.planet1?.name || '?'} ${a.aspect?.symbol || '☌'} ${a.planet2?.name || '?'}`
    ).join(', ');
    msg += `\n`;
  }

  return msg;
}

/**
 * Format trading scenarios
 */
function formatTradingScenarios(analysis) {
  const { displayName, scenarios, trend, planetary, price } = analysis;

  let msg = `<b>📋 ${displayName} TRADING SCENARIOS</b>\n\n`;

  if (!scenarios || scenarios.length === 0) {
    msg += `No clear setups at current price.\n`;
    return msg;
  }

  scenarios.forEach((scenario, idx) => {
    const typeEmoji = {
      'LONG': '🟢',
      'SHORT': '🔴',
      'BREAKOUT_LONG': '🚀',
      'BREAKDOWN_SHORT': '💀'
    };

    const confEmoji = scenario.confidence === 'high' ? '🔥' : '⚡';

    msg += `<b>${typeEmoji[scenario.type] || '📍'} ${scenario.type}</b> ${confEmoji}\n`;
    msg += `Condition: ${scenario.condition}\n`;
    msg += `Entry Zone: ${formatCoinPrice(scenario.entry, displayName)}\n`;
    msg += `HTF Bias: ${TREND_EMOJI[scenario.htfBias]} ${(scenario.htfBias || 'N/A').toUpperCase()}\n`;
    msg += `Planetary: ${TREND_EMOJI[scenario.planetaryBias]} ${(scenario.planetaryBias || 'N/A').toUpperCase()}\n`;

    if (scenario.confluence?.length > 0) {
      msg += `Confluence: ${scenario.confluence.slice(0, 3).join(' + ')}\n`;
    }

    if (idx < scenarios.length - 1) {
      msg += `\n${'─'.repeat(20)}\n\n`;
    }
  });

  msg += `\n<b>⚠️ REMEMBER:</b>\n`;
  msg += `• HTF ${trend?.daily?.trend?.toUpperCase() || 'trend'} bias is ${TREND_EMOJI[trend?.daily?.trend]} ${(trend?.daily?.trend || 'neutral').toUpperCase()}\n`;
  msg += `• Wait for price action confirmation\n`;
  msg += `• Set stops beyond key levels\n`;

  return msg;
}

/**
 * Format price for different coins (handles decimal places)
 */
function formatCoinPrice(price, symbol) {
  if (price === null || price === undefined) return 'N/A';

  // Determine decimal places based on price magnitude
  let decimals = 2;
  if (price < 0.0001) decimals = 8;
  else if (price < 0.01) decimals = 6;
  else if (price < 1) decimals = 4;
  else if (price < 100) decimals = 3;
  else decimals = 2;

  return '$' + Number(price).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Format planetary price levels (Billionaire Methods)
 */
function formatPlanetaryPriceLevels(analysis) {
  const { displayName, price, planetaryPrice: pp } = analysis;

  if (!pp) {
    return `<b>🔮 PLANETARY PRICE ANALYSIS</b>\n\nNo planetary data available.`;
  }

  let msg = `<b>🔮 ${displayName} PLANETARY PRICE LEVELS</b>\n`;
  msg += `<i>Billionaire-Level Planetary-Price Linkage</i>\n\n`;

  // ═══════════════════════════════════════════
  // PLANETARY PRICE ZONES
  // ═══════════════════════════════════════════
  if (pp.priceLevels?.levels?.length > 0) {
    msg += `<b>🪐 PLANETARY PRICE ZONES</b>\n`;

    // Active zones (price is at these levels NOW)
    const activeZones = pp.priceLevels.activeZones || [];
    if (activeZones.length > 0) {
      msg += `⚠️ <b>ACTIVE NOW:</b>\n`;
      activeZones.slice(0, 3).forEach(z => {
        msg += `  ${z.symbol} ${z.planet}: ${formatCoinPrice(z.level, displayName)} (${z.sign})\n`;
      });
      msg += '\n';
    }

    // Resistance levels
    const resistances = pp.priceLevels.resistances || [];
    if (resistances.length > 0) {
      msg += `↑ <b>Planetary Resistance:</b>\n`;
      resistances.slice(0, 4).forEach(r => {
        const activeMarker = r.isActive ? '🔥' : '';
        msg += `  ${r.symbol} ${r.planet} (${r.longitude.toFixed(0)}°): ${formatCoinPrice(r.level, displayName)} ${activeMarker}\n`;
      });
      msg += '\n';
    }

    // Support levels
    const supports = pp.priceLevels.supports || [];
    if (supports.length > 0) {
      msg += `↓ <b>Planetary Support:</b>\n`;
      supports.slice(0, 4).forEach(s => {
        const activeMarker = s.isActive ? '🔥' : '';
        msg += `  ${s.symbol} ${s.planet} (${s.longitude.toFixed(0)}°): ${formatCoinPrice(s.level, displayName)} ${activeMarker}\n`;
      });
      msg += '\n';
    }
  }

  // ═══════════════════════════════════════════
  // PRICE-TIME SQUARE
  // ═══════════════════════════════════════════
  if (pp.priceTimeSquare) {
    msg += `<b>⏰ PRICE-TIME SQUARE</b>\n`;

    if (pp.priceTimeSquare.hasActiveSquare) {
      const sq = pp.priceTimeSquare.strongestSquare;
      msg += `🎯 <b>ACTIVE SQUARE:</b>\n`;
      msg += `  ${sq.daysSince} days from ${sq.event}\n`;
      msg += `  Target: ${formatCoinPrice(sq.targetPrice, displayName)} | Accuracy: ${sq.accuracy.toFixed(1)}%\n`;
      msg += `  <i>Price = Time convergence → Major reversal zone</i>\n`;
    } else if (pp.priceTimeSquare.squares?.length > 0) {
      msg += `Nearest squares:\n`;
      pp.priceTimeSquare.squares.slice(0, 2).forEach(sq => {
        msg += `  • ${sq.daysSince}d from ${sq.event}: ${formatCoinPrice(sq.targetPrice, displayName)}\n`;
      });
    } else {
      msg += `No active price-time squares.\n`;
    }
    msg += '\n';
  }

  // ═══════════════════════════════════════════
  // LUNAR TRADING CYCLE
  // ═══════════════════════════════════════════
  if (pp.lunarCycle) {
    const lc = pp.lunarCycle;
    const zoneEmoji = {
      'accumulation': '🟢',
      'building': '🟢',
      'expansion': '🟡',
      'distribution': '🔴',
      'decline': '🔴',
      'capitulation': '⚪'
    };

    msg += `<b>🌙 LUNAR TRADING CYCLE</b>\n`;
    msg += `Phase: ${lc.phaseSymbol} ${lc.phase} (${lc.illumination}%)\n`;
    msg += `Zone: ${zoneEmoji[lc.tradingZone] || '⚪'} ${lc.tradingZone?.toUpperCase()}\n`;
    msg += `${lc.recommendation}\n`;

    if (lc.historicalBias) {
      msg += `Historical: ${lc.historicalBias.bullishProbability}% bullish | Avg: ${lc.historicalBias.avgReturn > 0 ? '+' : ''}${lc.historicalBias.avgReturn}%\n`;
    }
    msg += '\n';
  }

  // ═══════════════════════════════════════════
  // UPCOMING REVERSAL DATES
  // ═══════════════════════════════════════════
  if (pp.reversalDates?.dates?.length > 0) {
    msg += `<b>📅 PLANETARY REVERSAL DATES</b>\n`;

    pp.reversalDates.dates.slice(0, 5).forEach(rd => {
      const sigEmoji = {
        'very_high': '🔴',
        'high': '🟠',
        'medium': '🟡',
        'low': '⚪'
      };
      const emoji = sigEmoji[rd.significance] || '⚪';
      msg += `${emoji} ${rd.date} (${rd.daysUntil}d): ${rd.description}\n`;
    });
    msg += '\n';
  }

  // ═══════════════════════════════════════════
  // OVERALL PLANETARY BIAS
  // ═══════════════════════════════════════════
  if (pp.overallBias) {
    const biasEmoji = TREND_EMOJI[pp.overallBias.bias] || '⚪';
    msg += `<b>Overall Planetary Bias:</b> ${biasEmoji} ${pp.overallBias.bias?.toUpperCase()} (${pp.overallBias.biasStrength}%)\n`;
  }

  // Summary points
  if (pp.summary?.length > 0) {
    msg += `\n<b>📝 KEY POINTS:</b>\n`;
    pp.summary.slice(0, 3).forEach(point => {
      msg += `• ${point}\n`;
    });
  }

  return msg;
}

/**
 * Format status message
 */
function formatStatus(data) {
  const {
    price,
    change24h,
    confluence,
    nextBriefing,
    botUptime,
    timestamp = new Date()
  } = data;

  const changeEmoji = change24h >= 0 ? '🟢' : '🔴';

  let msg = `<b>📊 BOT STATUS</b>\n`;
  msg += `<code>${formatTime(timestamp)}</code>\n\n`;

  msg += `<b>BTC/USDT:</b> ${formatPrice(price)}\n`;
  msg += `24h Change: ${changeEmoji} ${formatPercent(change24h)}\n\n`;

  if (confluence) {
    const confBar = progressBar(confluence.score * 100);
    msg += `<b>Confluence:</b> ${(confluence.score * 100).toFixed(0)}%\n`;
    msg += `${confBar}\n`;
    msg += `Bias: ${TREND_EMOJI[confluence.bias]} ${(confluence.bias || 'NEUTRAL').toUpperCase()}\n\n`;
  }

  if (nextBriefing) {
    msg += `<b>Next Briefing:</b>\n`;
    msg += `${formatTime(nextBriefing)}\n\n`;
  }

  if (botUptime) {
    const hours = Math.floor(botUptime / 3600);
    const mins = Math.floor((botUptime % 3600) / 60);
    msg += `<b>Uptime:</b> ${hours}h ${mins}m\n`;
  }

  return msg;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Utilities
  formatPrice,
  formatPercent,
  formatTime,
  formatDate,
  escapeHtml,
  progressBar,
  formatCoinPrice,

  // Message formatters
  formatDailyBriefing,
  formatWeeklyWarRoom,
  formatAlert,
  formatConfluence,
  formatPlanetary,
  formatGann,
  formatError,
  formatHelp,
  formatStatus,
  formatCoinAnalysis,
  formatTradingScenarios,
  formatPlanetaryPriceLevels,

  // Constants
  TREND_EMOJI,
  CONFIDENCE_EMOJI,
  REGIME_EMOJI
};
